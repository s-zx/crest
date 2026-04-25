// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package textdiff

import (
	"strings"
	"testing"
)

func TestUnifiedDiff_Identical(t *testing.T) {
	content := []byte("line1\nline2\nline3\n")
	diff := UnifiedDiff(content, content, "test.txt")
	if diff != "" {
		t.Fatalf("expected empty diff for identical content, got:\n%s", diff)
	}
}

func TestUnifiedDiff_NewFile(t *testing.T) {
	diff := UnifiedDiff(nil, []byte("hello\nworld\n"), "new.txt")
	if !strings.Contains(diff, "+hello") {
		t.Fatalf("expected +hello in new file diff:\n%s", diff)
	}
	if !strings.Contains(diff, "+world") {
		t.Fatalf("expected +world in new file diff:\n%s", diff)
	}
	if strings.Contains(diff, "-") && !strings.HasPrefix(diff, "---") {
		t.Fatalf("new file should have no deletions:\n%s", diff)
	}
}

func TestUnifiedDiff_DeletedContent(t *testing.T) {
	diff := UnifiedDiff([]byte("hello\nworld\n"), nil, "old.txt")
	if !strings.Contains(diff, "-hello") {
		t.Fatalf("expected -hello in deleted content diff:\n%s", diff)
	}
	if !strings.Contains(diff, "-world") {
		t.Fatalf("expected -world:\n%s", diff)
	}
}

func TestUnifiedDiff_SingleLineChange(t *testing.T) {
	orig := []byte("line1\nline2\nline3\n")
	mod := []byte("line1\nmodified\nline3\n")
	diff := UnifiedDiff(orig, mod, "test.txt")
	if !strings.Contains(diff, "-line2") {
		t.Fatalf("expected -line2:\n%s", diff)
	}
	if !strings.Contains(diff, "+modified") {
		t.Fatalf("expected +modified:\n%s", diff)
	}
	if !strings.Contains(diff, " line1") {
		t.Fatalf("expected context line1:\n%s", diff)
	}
}

func TestUnifiedDiff_Header(t *testing.T) {
	orig := []byte("a\n")
	mod := []byte("b\n")
	diff := UnifiedDiff(orig, mod, "path/to/file.go")
	if !strings.HasPrefix(diff, "--- a/path/to/file.go\n+++ b/path/to/file.go\n") {
		t.Fatalf("bad header:\n%s", diff)
	}
}

func TestUnifiedDiff_MultipleHunks(t *testing.T) {
	var origLines, modLines []string
	for i := 0; i < 20; i++ {
		origLines = append(origLines, "unchanged")
		modLines = append(modLines, "unchanged")
	}
	origLines[2] = "old-a"
	modLines[2] = "new-a"
	origLines[17] = "old-b"
	modLines[17] = "new-b"
	orig := []byte(strings.Join(origLines, "\n") + "\n")
	mod := []byte(strings.Join(modLines, "\n") + "\n")
	diff := UnifiedDiff(orig, mod, "multi.txt")
	if strings.Count(diff, "@@") < 2 {
		t.Fatalf("expected at least 2 hunks:\n%s", diff)
	}
}

func TestUnifiedDiff_AddedLines(t *testing.T) {
	orig := []byte("line1\nline3\n")
	mod := []byte("line1\nline2\nline3\n")
	diff := UnifiedDiff(orig, mod, "add.txt")
	if !strings.Contains(diff, "+line2") {
		t.Fatalf("expected +line2:\n%s", diff)
	}
}

func TestUnifiedDiff_RemovedLines(t *testing.T) {
	orig := []byte("line1\nline2\nline3\n")
	mod := []byte("line1\nline3\n")
	diff := UnifiedDiff(orig, mod, "rm.txt")
	if !strings.Contains(diff, "-line2") {
		t.Fatalf("expected -line2:\n%s", diff)
	}
}
