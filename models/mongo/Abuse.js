const { ObjectId } = require('mongodb');

module.exports = {
	user: { type: ObjectId, required: true, ref: 'User' },
	title: { type: String, required: true },
	text: { type: String, required: true },
	answer: { type: String, default: '' },
	resolved: { type: Boolean, default: false },
}
