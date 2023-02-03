const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();
const validate = require('../utils/Verify');

module.exports = class Account extends HttpController {
    async onLoad() {
        if (!this.session.user) return this.drop();
    }

    async abuse() {
        return await db.Abuse.findOne({ user: this.session.user, resolved: false }).lean() || null;
    }

    async changePassword() {
        if(!this.data || !this.data.old || !this.data.new || !this.data.newr) return this.send('FillFields', 400);

        const user = await db.User.findById(this.session.user).lean();
        if(!user) return this.send('WhoAmI', 403);

        if(!validate.PASSWORD_REGEX.test(this.data.new)) return this.send('Password', 400);
        if(this.data.old !== user.password) return this.send('OldPassword', 403);
        if(this.data.new !== this.data.newr) return this.send('PasswordRepeat', 400);

        await db.User.updateOne({ _id: user._id }, { password: this.data.new });

        return 'Success';
    }
}