const PASSWORD_CHARS = '1234567890_!*.qwertyuiopasdfghjklzxcvbnmQWERTYUIOPASDFGHJKKLZXCVBNM';

module.exports = {
	makeUsername (email) {
		return email.replace(/[+@].*$|[^a-zA-Z0-9]/g, '') + (Math.random() * 999).toFixed().padEnd(3, '0');
	},
	makePassword (length) {
		const maxIndex = PASSWORD_CHARS.length - 1;

		let result = '';
		for (let i = 0; i < length; i++) result += PASSWORD_CHARS[Math.round(Math.random() * maxIndex)];

		return result;
	},
	makeCode (length) {
		let result = '';
		for (let i = 0; i < length; i++) result += Math.round(Math.random() * 9);

		return result;
	}
};