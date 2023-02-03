const { HttpController } = require('dc-api-core');
const db = require('dc-api-mongo').connect();
const { PASSWORD_REGEX, HUMAN_NAME_REGEX, EMAIL_REGEX } = require('../utils/Verify');

module.exports = class Auth extends HttpController {
    async register() {
        if (!this.data || !this.data.firstname || !this.data.lastname || !this.data.email || !this.data.password || !this.data.passwordr) return this.send('FillFields', 400);
        
        if(!HUMAN_NAME_REGEX.test(this.data.firstname) || !HUMAN_NAME_REGEX.test(this.data.lastname)) return this.send('HumanName', 400);
        if(!EMAIL_REGEX.test(this.data.email)) return this.send('Email', 400);
        if(this.data.password !== this.data.passwordr) return this.send('PasswordRepeat', 400);
        if(!PASSWORD_REGEX.test(this.data.password)) return this.send('Password', 400);

        const exists = await db.User.exists({ email: this.data.email });
        if(exists) return this.send('Exists', 403);

        const create = await db.User.create({
            firstname: this.data.firstname,
            lastname: this.data.lastname,
            email: this.data.email,
            password: this.data.password
        });

        await db.Operation.create({
            user_id: create._id,
            description: 'Аккаунт успешно создан'
        });

        return 'Success';
    }

    async login() {
        if(!this.data || !this.data.email || !this.data.password) return this.send('FillFields', 400);

        const user = await db.User.findOne({ email: this.data.email, password: this.data.password }).lean();
        if(!user) return this.send('Incorrect', 403);

        this.session.user = user._id;
        await this.session.save();

        return 'Success';
    }

    async getSession() {
        if(!this.session.user) return this.send('NoSession', 403);

        return await db.User.findById(this.session.user).select('-password').lean();
    }

    async logout() {
        await this.session.destroy();
        return 'Success';
    }
}

