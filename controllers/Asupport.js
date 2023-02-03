const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();

module.exports = class Asupport extends HttpController {
    async onLoad() {
        if (!this.session.user) return this.drop();

        const user = await db.User.findById(this.session.user).lean();
        if (!user || user.group !== 'admin') return this.send('NoPermission', 403);
    }

    async list() {
        const tickets = await db.Ticket.find().sort({ _id: -1 }).lean();

        for(let item of tickets) {
            const user = await db.User.findOne({ _id: item.user_id }).lean();
            if(!user) continue;

            item['user_email'] = user.email;
        }
        
        return tickets;
    }

    async view() {
        if (!this.data) return this.send('FillFields', 400);

        const ticket = await db.Ticket.findOne({ _id: this.data }).lean();
        if (!ticket) return this.send('NoTicket', 404);

        const messages = await db.Message.find({ ticket_id: ticket._id }).sort({ _id: -1 }).lean();

        return { ticket, messages };
    }

    async answer() {
        if (!this.data || !this.data._id || !this.data.text || !this.data.title) return this.send('FillFields', 400);

        const ticket = await db.Ticket.findOne({ _id: this.data._id }).lean();
        if (!ticket) return this.send('NoTicket', 404);

        await db.Message.create({ ticket_id: ticket._id, title: this.data.title, text: this.data.text, status: this.data.status });

        return 'Success';
    }

    async toggle() {
        if(!this.data) return this.send('FillFields', 400);

        const ticket = await db.Ticket.findOne({ _id: this.data }).lean();
        if (!ticket) return this.send('NoTicket', 404);

        await db.Ticket.updateOne({ _id: ticket._id }, { solved: !ticket.solved });

        return 'Success';
    }

    async create() {
        if (!this.data || !this.data.title || !this.data.email || !this.data.text) return this.send('FillFields', 400);

        const user = await db.User.findOne({ email: this.data.email });
        if (!user) this.send('NoUser', 404);

        const ticket = await db.Ticket.create({ user_id: user._id, title: this.data.title });
        await db.Message.create({ ticket_id: ticket._id, title: 'Обращение принято', text: this.data.text });

        return 'Success';
    }
}