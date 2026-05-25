/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
		fontFamily: {
			heading: ['"TAN Mon Cheri"', 'serif'],
			body: ['"Instrument Serif"', 'Georgia', 'serif'],
		},
		colors: {
			paper: '#FAF8F5',
			ink: '#1A1A1A',
			warmgray: {
				100: '#F5F3F0',
				200: '#E8E4DF',
				300: '#D4CFC8',
				400: '#A39E99',
				500: '#6B6560',
				600: '#4A4540',
			},
			rust: {
				DEFAULT: '#8B4513',
				dark: '#6B3410',
				light: '#D4A574',
			},
		},
		spacing: {
			'18': '4.5rem',
			'88': '22rem',
		},
		borderRadius: {
			'xl': '16px',
			'2xl': '24px',
		},
		transitionTimingFunction: {
			'editorial': 'cubic-bezier(0.16, 1, 0.3, 1)',
		},
	}
},
	plugins: []
};
