const { ObjectId } = require('mongodb');

module.exports = {
    node_id: { type: ObjectId, required: true },
    name: { type: String, required: true },
    vcpu: { type: Number, required: true },
    ram: { type: Number, required: true },
    disk: { type: Number, required: true },
    price: { type: Number, required: true },
    available: { type: Boolean, default: true }
};
