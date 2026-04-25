// Copyright 2026, Command Line Inc.
// SPDX-License-Identifier: Apache-2.0

package textdiff

import (
	"fmt"
	"strings"
)

const (
	DefaultContextLines = 3
	DefaultMaxLines     = 100
)

func UnifiedDiff(original, modified []byte, filename string) string {
	origLines := splitLines(string(original))
	modLines := splitLines(string(modified))
	ops := lcsDiff(origLines, modLines)

	hunks := buildHunks(origLines, modLines, ops, DefaultContextLines)
	if len(hunks) == 0 {
		return ""
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("--- a/%s\n", filename))
	sb.WriteString(fmt.Sprintf("+++ b/%s\n", filename))
	totalLines := 0
	for _, h := range hunks {
		if totalLines >= DefaultMaxLines {
			sb.WriteString(fmt.Sprintf("... (truncated)\n"))
			break
		}
		sb.WriteString(fmt.Sprintf("@@ -%d,%d +%d,%d @@\n", h.origStart+1, h.origCount, h.modStart+1, h.modCount))
		for _, line := range h.lines {
			sb.WriteString(line)
			sb.WriteByte('\n')
			totalLines++
			if totalLines >= DefaultMaxLines {
				break
			}
		}
	}
	return sb.String()
}

type editOp int

const (
	opEqual  editOp = 0
	opDelete editOp = 1
	opInsert editOp = 2
)

type hunk struct {
	origStart int
	origCount int
	modStart  int
	modCount  int
	lines     []string
}

func splitLines(s string) []string {
	if s == "" {
		return nil
	}
	lines := strings.Split(s, "\n")
	if len(lines) > 0 && lines[len(lines)-1] == "" {
		lines = lines[:len(lines)-1]
	}
	return lines
}

func lcsDiff(a, b []string) []editOp {
	n := len(a)
	m := len(b)
	if n == 0 && m == 0 {
		return nil
	}

	dp := make([][]int, n+1)
	for i := range dp {
		dp[i] = make([]int, m+1)
	}
	for i := n - 1; i >= 0; i-- {
		for j := m - 1; j >= 0; j-- {
			if a[i] == b[j] {
				dp[i][j] = dp[i+1][j+1] + 1
			} else if dp[i+1][j] >= dp[i][j+1] {
				dp[i][j] = dp[i+1][j]
			} else {
				dp[i][j] = dp[i][j+1]
			}
		}
	}

	var ops []editOp
	i, j := 0, 0
	for i < n && j < m {
		if a[i] == b[j] {
			ops = append(ops, opEqual)
			i++
			j++
		} else if dp[i+1][j] >= dp[i][j+1] {
			ops = append(ops, opDelete)
			i++
		} else {
			ops = append(ops, opInsert)
			j++
		}
	}
	for i < n {
		ops = append(ops, opDelete)
		i++
	}
	for j < m {
		ops = append(ops, opInsert)
		j++
	}
	return ops
}

func buildHunks(orig, mod []string, ops []editOp, ctx int) []hunk {
	type diffLine struct {
		op       editOp
		origIdx  int
		modIdx   int
		text     string
	}

	var lines []diffLine
	oi, mi := 0, 0
	for _, op := range ops {
		switch op {
		case opEqual:
			lines = append(lines, diffLine{opEqual, oi, mi, orig[oi]})
			oi++
			mi++
		case opDelete:
			lines = append(lines, diffLine{opDelete, oi, mi, orig[oi]})
			oi++
		case opInsert:
			lines = append(lines, diffLine{opInsert, oi, mi, mod[mi]})
			mi++
		}
	}

	changed := make([]bool, len(lines))
	for i, dl := range lines {
		if dl.op != opEqual {
			changed[i] = true
		}
	}

	inHunk := make([]bool, len(lines))
	for i := range lines {
		if !changed[i] {
			continue
		}
		lo := i - ctx
		if lo < 0 {
			lo = 0
		}
		hi := i + ctx
		if hi >= len(lines) {
			hi = len(lines) - 1
		}
		for j := lo; j <= hi; j++ {
			inHunk[j] = true
		}
	}

	var hunks []hunk
	var cur *hunk
	for i, dl := range lines {
		if !inHunk[i] {
			if cur != nil {
				hunks = append(hunks, *cur)
				cur = nil
			}
			continue
		}
		if cur == nil {
			cur = &hunk{origStart: dl.origIdx, modStart: dl.modIdx}
		}
		switch dl.op {
		case opEqual:
			cur.lines = append(cur.lines, " "+dl.text)
			cur.origCount++
			cur.modCount++
		case opDelete:
			cur.lines = append(cur.lines, "-"+dl.text)
			cur.origCount++
		case opInsert:
			cur.lines = append(cur.lines, "+"+dl.text)
			cur.modCount++
		}
	}
	if cur != nil {
		hunks = append(hunks, *cur)
	}

	allEqual := true
	for _, op := range ops {
		if op != opEqual {
			allEqual = false
			break
		}
	}
	if allEqual {
		return nil
	}

	return hunks
}
