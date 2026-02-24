import cloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	kit: {
		adapter: isGitHubPages
			? adapterStatic({
					fallback: '404.html'
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
		},
		prerender: {
			entries: ['/', '/legal', '/en', '/es', '/en/legal', '/es/legal']
		}
	}
};

export default config;
