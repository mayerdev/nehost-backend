const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Support extends HttpController {
    async onLoad() {
        if(!this.session.user) return this.drop();
    }

    async list() {
        return await db.Ticket.find({ user_id: this.session.user }).sort({ _id: -1 }).lean();
    }

    async view() {
        if(!this.data) return this.send('FillFields', 400);

        const ticket = await db.Ticket.findOne({ _id: this.data, user_id: this.session.user }).lean();
        if(!ticket) return this.send('NoTicket', 404);

        const messages = await db.Message.find({ ticket_id: ticket._id }).sort({ _id: -1 }).lean();

        return { ticket, messages };
    }

    async abuses() {
        return await db.Abuse.find({ user: this.session.user, resolved: false }).lean();
    }
}