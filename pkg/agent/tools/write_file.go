// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package tools

import (
	"os"

	"github.com/s-zx/crest/pkg/aiusechat"
	"github.com/s-zx/crest/pkg/aiusechat/uctypes"
)

// WriteTextFile wraps aiusechat.GetWriteTextFileToolDefinition with the
// agent's approval callback and a stale-edit guard: if the model is
// overwriting a file it had previously read, refuse the write when the
// file has changed externally since that read.
func WriteTextFile(chatId string, approval func(any) string) uctypes.ToolDefinition {
	t := aiusechat.GetWriteTextFileToolDefinition()
	t.ToolLogName = "agent:write_text_file"
	t.ToolApproval = approval
	t.Prompt = `write_text_file: Writes a complete file (overwrites if it exists).
- Prefer edit_text_file or multi_edit for modifications — they only send the diff. Use write_text_file for new files or full rewrites.
- For an existing file, you should normally read_text_file it first so you don't clobber unrelated content.
- Never create documentation files (*.md, README, CHANGELOG) unless the user explicitly asked for one.`
	wrapWithFileGuard(&t, chatId)
	return t
}

// EditTextFile wraps the underlying edit tool with the same stale-edit guard.
// The guard fires when the file has been modified externally between the
// agent's last read and this edit; without it, an out-of-band change is
// silently overwritten by the agent's stale view of the file.
func EditTextFile(chatId string, approval func(any) string) uctypes.ToolDefinition {
	t := aiusechat.GetEditTextFileToolDefinition()
	t.ToolLogName = "agent:edit_text_file"
	t.ToolApproval = approval
	t.Prompt = `edit_text_file: Performs an exact string replacement in a file.
- Read the file first if you don't already have its contents — the edit fails if "old_text" doesn't match exactly (whitespace, indentation, line endings included).
- "old_text" must be unique within the file, or pass "replace_all": true. If the match isn't unique, expand "old_text" with surrounding context until it is.
- Preserve indentation exactly as the file uses it (tabs vs spaces, leading whitespace).
- For multiple changes in the same file, prefer multi_edit over several edit_text_file calls — it applies sequentially in one round trip.`
	wrapWithFileGuard(&t, chatId)
	return t
}

// wrapWithFileGuard mutates the ToolDefinition to insert a pre-write check
// (refuse if the file changed externally) and a post-write record (refresh
// the recorded mtime/size so the next edit sees the agent's own write).
// Works for both ToolTextCallback and ToolAnyCallback shapes.
func wrapWithFileGuard(t *uctypes.ToolDefinition, chatId string) {
	if t == nil {
		return
	}
	preCheck := func(input any) error {
		p := extractFilenameFromInput(input)
		if p == "" {
			return nil
		}
		// Skip the check when the path doesn't exist yet — that's a new-file
		// write, which needs no prior read. The underlying tool does its own
		// "is this allowed" / "directory exists" validation.
		if _, err := os.Stat(p); err != nil {
			return nil
		}
		return checkFileUnchanged(chatId, p)
	}
	postRecord := func(input any) {
		if p := extractFilenameFromInput(input); p != "" {
			recordFileRead(chatId, p)
		}
	}
	if inner := t.ToolTextCallback; inner != nil {
		t.ToolTextCallback = func(input any) (string, error) {
			if err := preCheck(input); err != nil {
				return "", err
			}
			out, err := inner(input)
			if err == nil {
				postRecord(input)
			}
			return out, err
		}
		return
	}
	if inner := t.ToolAnyCallback; inner != nil {
		t.ToolAnyCallback = func(input any, td *uctypes.UIMessageDataToolUse) (any, error) {
			if err := preCheck(input); err != nil {
				return nil, err
			}
			out, err := inner(input, td)
			if err == nil {
				postRecord(input)
			}
			return out, err
		}
	}
}
