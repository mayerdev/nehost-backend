const { ObjectId } = require('mongodb');

module.exports = {
    $increment: 'numId',
    firstname: { type: String, required: true },
    lastname: { type: String, required: true },
    email: { type: String, required: true },
    password: { type: String, required: true },
    balance: { type: Number, default: 0 },
    credit_limit: { type: Number, default: 0 },
    dogovor: {
        fio: { type: String },
        passport: { type: String },
        email: { type: String },
        phone: { type: String },
        accepted: { type: Boolean, default: false }
    },
    owner: { type: ObjectId },
    limits: {
        vcpu: { type: Number, default: 2 },
        ram: { type: Number, default: 8 },
        disk: { type: Number, default: 64 },
        sites: { type: Number, default: 8 },
        ports: { type: Number, default: 25 },
    },
    group: { type: String, enum: ['user', 'admin'], default: 'user' }
};
