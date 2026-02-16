import cloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: isGitHubPages
			? adapterStatic({
					fallback: 'index.html'
				})
			: cloudflare({
					// See below for an explanation of these options
					routes: {
						include: ['/*'],
						exclude: ['<all>']
					}
				}),
		paths: {
			base: isGitHubPages ? '/Anglicus' : ''
		}
	}
};

export default config;
