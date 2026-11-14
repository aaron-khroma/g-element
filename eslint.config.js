import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['dist', 'coverage'] },
	js.configs.recommended,
	...tseslint.configs.strict,
	reactHooks.configs.flat['recommended-latest'],
	{
		// core/ is framework- and DOM-free, so other tiers can sit on top of it (docs/SPEC.md §2a).
		files: ['src/core/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
							message: 'core/ must not depend on React.',
						},
					],
				},
			],
			'no-restricted-globals': [
				'error',
				...[
					'window',
					'document',
					'navigator',
					'location',
					'localStorage',
					'sessionStorage',
					'matchMedia',
					'getComputedStyle',
					'requestAnimationFrame',
					'HTMLElement',
					'Element',
					'Node',
					'Event',
				].map((name) => ({
					name,
					message: 'core/ must not touch the DOM; take it through CircuitEnv.',
				})),
			],
		},
	},
	prettier,
);
