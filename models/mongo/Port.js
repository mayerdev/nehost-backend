const { ObjectId } = require('mongodb');

module.exports = {
    subnet_id: { type: ObjectId, required: true },
    ip_id: { type: ObjectId },
    port: { type: Number, required: true },
    localPort: { type: Number },
    allocated: { type: Boolean, default: false },
};
