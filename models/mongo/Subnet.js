const { ObjectId } = require('mongodb');

module.exports = {
    node_id: { type: ObjectId, required: true },
    subnet: { type: String, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
};
