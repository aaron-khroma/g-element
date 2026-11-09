import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
	{ ignores: ['dist', 'coverage'] },
	js.configs.recommended,
	...tseslint.configs.strict,
	reactHooks.configs.flat['recommended-latest'],
	prettier,
);
