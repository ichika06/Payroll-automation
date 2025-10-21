/** @type {import('next').NextConfig} */
const nextConfig = {
	webpack: (config, { dev }) => {
		if (!dev) {
			config.optimization.minimize = true
		}
		return config
	},
	compiler: {
		removeConsole: {
			exclude: ['error', 'warn'],
		},
	},
};

export default nextConfig;
