const { ObjectId } = require('mongodb');

module.exports = {
    location_id: { type: ObjectId, required: true },
    visible_name: { type: String, required: true },
    name: { type: String, required: true },
    hostname: { type: String, required: true },
    username: { type: String, required: true },
    password: { type: String, required: true },
    available: { type: Boolean, default: true }
};
