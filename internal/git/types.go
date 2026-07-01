package git

import "time"

type ObjectType string

const (
	ObjectBlob   ObjectType = "blob"
	ObjectTree   ObjectType = "tree"
	ObjectCommit ObjectType = "commit"
	ObjectTag    ObjectType = "tag"
)

type Object struct {
	Hash string
	Type ObjectType
	Size int64
	Raw  []byte
}

type Signature struct {
	Name  string
	Email string
	Time  time.Time
}

type CommitObject struct {
	Hash         string
	TreeHash     string
	ParentHashes []string
	Author       Signature
	Committer    Signature
	Message      string
}

type TreeEntry struct {
	Mode string
	Type ObjectType
	Name string
	Hash string
}
