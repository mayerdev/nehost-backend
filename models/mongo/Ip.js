const { ObjectId } = require('mongodb');

module.exports = {
    subnet_id: { type: ObjectId, required: true },
    vserver_id: { type: ObjectId },
    ip: { type: String, required: true },
    reserved: { type: Boolean, default: false },
};
