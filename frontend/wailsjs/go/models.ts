export namespace git {
	
	export class GitDiffFile {
	    path: string;
	    diff: string;
	    linesAdded: number;
	    linesRemoved: number;
	
	    static createFrom(source: any = {}) {
	        return new GitDiffFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.diff = source["diff"];
	        this.linesAdded = source["linesAdded"];
	        this.linesRemoved = source["linesRemoved"];
	    }
	}
	export class GitDiffResult {
	    files: GitDiffFile[];
	
	    static createFrom(source: any = {}) {
	        return new GitDiffResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], GitDiffFile);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class GitStatusResult {
	    files: string[];
	    branchName: string;
	    mergeInProgress: boolean;
	
	    static createFrom(source: any = {}) {
	        return new GitStatusResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.branchName = source["branchName"];
	        this.mergeInProgress = source["mergeInProgress"];
	    }
	}

}

