// @ts-check
// Cynhyrchwyd y ffeil hon yn awtomatig. PEIDIWCH Â MODIWL
/**
 * Aborts the current merge operation.
 */

export function AbortMerge() {
  return window['go']['main']['App']['AbortMerge']();
}

/**
 * Archives a Git branch.
 */
export function ArchiveGitBranch(arg1, arg2) {
  return window['go']['main']['App']['ArchiveGitBranch'](arg1, arg2);
}

/**
 * Archives a remote Git branch.
 * @param {*} arg1 - The repository identifier or path.
 * @param {*} arg2 - The remote branch name.
 * @return {*} The result of the archive operation.
 */
export function ArchiveRemoteGitBranch(arg1, arg2) {
  return window['go']['main']['App']['ArchiveRemoteGitBranch'](arg1, arg2);
}

export function CommitGitChanges(arg1) {
  return window['go']['main']['App']['CommitGitChanges'](arg1);
}

export function ContinueMerge() {
  return window['go']['main']['App']['ContinueMerge']();
}

export function DeleteGitBranch(arg1, arg2) {
  return window['go']['main']['App']['DeleteGitBranch'](arg1, arg2);
}

export function DiscardGitFile(arg1) {
  return window['go']['main']['App']['DiscardGitFile'](arg1);
}

export function GetCommitHistory() {
  return window['go']['main']['App']['GetCommitHistory']();
}

export function GetGitBranches() {
  return window['go']['main']['App']['GetGitBranches']();
}

export function GitDiff() {
  return window['go']['main']['App']['GitDiff']();
}

export function GitDiffStaged() {
  return window['go']['main']['App']['GitDiffStaged']();
}

export function GitFetch() {
  return window['go']['main']['App']['GitFetch']();
}

export function GitPrune() {
  return window['go']['main']['App']['GitPrune']();
}

export function PickFolder() {
  return window['go']['main']['App']['PickFolder']();
}

export function PullGitChanges() {
  return window['go']['main']['App']['PullGitChanges']();
}

export function PushGitChanges() {
  return window['go']['main']['App']['PushGitChanges']();
}

export function ResolveGitConflict(arg1, arg2) {
  return window['go']['main']['App']['ResolveGitConflict'](arg1, arg2);
}

export function RunGitStatus() {
  return window['go']['main']['App']['RunGitStatus']();
}

export function SetGitCommand(arg1) {
  return window['go']['main']['App']['SetGitCommand'](arg1);
}

/**
 * Sets the Git command used for remote operations.
 * @param {string} arg1 - The command to use for Git remote operations.
 */
export function SetGitRemoteCommand(arg1) {
  return window['go']['main']['App']['SetGitRemoteCommand'](arg1);
}

export function SetMaxStageFileSize(arg1) {
  return window['go']['main']['App']['SetMaxStageFileSize'](arg1);
}

/**
 * Set the path to the Git repository.
 * @param {string} arg1 - The repository path.
 */
export function SetRepositoryPath(arg1) {
  return window['go']['main']['App']['SetRepositoryPath'](arg1);
}

export function StageGitFile(arg1) {
  return window['go']['main']['App']['StageGitFile'](arg1);
}

export function SwitchGitBranch(arg1) {
  return window['go']['main']['App']['SwitchGitBranch'](arg1);
}

export function UnstageGitFile(arg1) {
  return window['go']['main']['App']['UnstageGitFile'](arg1);
}
