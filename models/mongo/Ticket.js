const { ObjectId } = require('mongodb');

module.exports = {
    user_id: { type: ObjectId, required: true },
    title: { type: String, required: true },
    solved: { type: Boolean, default: false },
};
