declare namespace chrome {
	namespace runtime {
		interface Manifest {
			manifest_version?: number;
			version?: string;
			name?: string;
			permissions?: string[];
			optional_permissions?: string[];
			host_permissions?: string[];
			optional_host_permissions?: string[];
			content_scripts?: Array<{
				matches?: string[];
				js?: string[];
				run_at?: string;
			}>;
			background?: {
				service_worker?: string;
				scripts?: string[];
			};
			action?: {
				default_popup?: string;
			};
			browser_action?: {
				default_popup?: string;
			};
			commands?: Record<string, {
				suggested_key?: Record<string, string>;
				description?: string;
			}>;
			icons?: Record<string, string>;
			[key: string]: unknown;
		}
	}
}
