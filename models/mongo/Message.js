const { ObjectId } = require('mongodb');

module.exports = {
    ticket_id: { type: ObjectId, required: true },
    title: { type: String, required: true },
    text: { type: String, required: true },
    status: { type: String, enum: ['success', 'fail', 'wait'], default: 'wait' },
};
