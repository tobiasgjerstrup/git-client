package git

import (
	"encoding/hex"
	"fmt"
	"strconv"
	"strings"
	"time"
)

func ParseCommit(raw []byte) (*CommitObject, error) {
	s := string(raw)
	lines := strings.Split(s, "\n")

	c := &CommitObject{}

	var messageStart int
	headersDone := false

	for i, line := range lines {
		if !headersDone && line == "" {
			headersDone = true
			messageStart = i + 1
			continue
		}
		if headersDone {
			continue
		}

		parts := strings.SplitN(line, " ", 2)
		if len(parts) < 2 {
			continue
		}

		switch parts[0] {
		case "tree":
			c.TreeHash = parts[1]
		case "parent":
			c.ParentHashes = append(c.ParentHashes, parts[1])
		case "author":
			sig, err := parseSignature(parts[1])
			if err != nil {
				return nil, fmt.Errorf("parse author: %w", err)
			}
			c.Author = sig
		case "committer":
			sig, err := parseSignature(parts[1])
			if err != nil {
				return nil, fmt.Errorf("parse committer: %w", err)
			}
			c.Committer = sig
		}
	}

	if messageStart < len(lines) {
		c.Message = strings.Join(lines[messageStart:], "\n")
	}

	return c, nil
}

func parseSignature(s string) (Signature, error) {
	lt := strings.LastIndexByte(s, '>')
	if lt < 0 {
		lt = strings.IndexByte(s, ' ')
	}

	if lt < 0 {
		return Signature{}, fmt.Errorf("invalid signature line: no email end found")
	}

	nameEmail := s[:lt+1]
	nameEnd := strings.IndexByte(nameEmail, '<')
	if nameEnd < 0 {
		return Signature{}, fmt.Errorf("invalid signature: no email bracket found")
	}
	name := strings.TrimSpace(nameEmail[:nameEnd])
	email := strings.Trim(nameEmail[nameEnd:], "<>")

	rest := strings.TrimSpace(s[lt+1:])
	parts := strings.Fields(rest)
	if len(parts) < 2 {
		return Signature{Name: name, Email: email}, nil
	}

	unixSec, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return Signature{Name: name, Email: email}, nil
	}

	tz := parts[1]
	sign := 1
	if strings.HasPrefix(tz, "-") {
		sign = -1
	}
	tzHours, _ := strconv.Atoi(tz[1:3])
	tzMins, _ := strconv.Atoi(tz[3:5])
	loc := time.FixedZone("", sign*(tzHours*3600+tzMins*60))

	return Signature{
		Name:  name,
		Email: email,
		Time:  time.Unix(unixSec, 0).In(loc),
	}, nil
}

func ParseTree(raw []byte) ([]TreeEntry, error) {
	var entries []TreeEntry

	for len(raw) > 0 {
		nullIdx := -1
		for i, b := range raw {
			if b == 0 {
				nullIdx = i
				break
			}
		}
		if nullIdx < 0 {
			break
		}

		prefix := string(raw[:nullIdx])
		parts := strings.SplitN(prefix, " ", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid tree entry: %q", prefix)
		}
		mode := parts[0]
		name := parts[1]

		hashStart := nullIdx + 1
		if len(raw) < hashStart+20 {
			return nil, fmt.Errorf("truncated tree entry: not enough bytes for hash")
		}

		hashBytes := raw[hashStart : hashStart+20]
		hash := hex.EncodeToString(hashBytes)

		objType := ObjectBlob
		if mode == "040000" {
			objType = ObjectTree
		} else if mode == "160000" {
			objType = ObjectCommit
		}

		entries = append(entries, TreeEntry{
			Mode: mode,
			Type: objType,
			Name: name,
			Hash: hash,
		})

		raw = raw[hashStart+20:]
	}

	return entries, nil
}
