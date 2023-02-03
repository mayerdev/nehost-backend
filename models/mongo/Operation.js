const { ObjectId } = require('mongodb');

module.exports = {
    $increment: 'numId',
    user_id: { type: ObjectId, required: true },
    description: { type: String, required: true }
};
