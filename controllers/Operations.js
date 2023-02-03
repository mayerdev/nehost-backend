const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Operations extends HttpController {
    onLoad() {
        if(!this.session.user) return this.drop();
    }

    async list() {
        return await db.Operation.find({ user_id: this.session.user }).sort({ _id: -1 }).limit(5).lean();
    }
}