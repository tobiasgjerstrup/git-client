export namespace main {
	
	export class GitStatusResult {
	    files: string[];
	    branchName: string;
	
	    static createFrom(source: any = {}) {
	        return new GitStatusResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = source["files"];
	        this.branchName = source["branchName"];
	    }
	}

}

