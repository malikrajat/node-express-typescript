import mysql from 'mysql2/promise';

const config = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    database: process.env.DB_DATABASE,
    password: process.env.DB_PASSWORD
};
let connection;
mysql.createConnection(config).then(c => {
    connection = c;
}).catch(e => {
    console.log('Connection error: Falling back to mocking');
    connection = {
        runner:0,
        expectedOutcomes:[],
        addExpectedOutcome(err,outcome){
            this.expectedOutcomes.push({
                error:err,
                outcome:outcome
            })
        },
        async query(sql, values){
            let res = this.expectedOutcomes[this.runner];
            this.runner++;
            if(res.error){
                throw new Error(res.error);
            }
            return [res.outcome]
        },
        async execute(sql, values){
            return await this.query(sql, values)
        }
    }
})


export default {
    getConnection(){
        return connection;
    },
    async raw(sql){
        try{
            const [rows] = await connection.query(sql);
            return rows;
        } catch (e) {
            throw new Error('Issue with query: ' + sql + "\n" + e)
        }
    },
    async query(sql: string, values: Object) {
        const prepared = this.prepare(sql, values);
        try{
            const [rows] = await connection.execute(...prepared);
            return rows;
        } catch (e) {
            throw new Error('Issue with query: ' + sql + "\n" + e)
        }
    },
    async get(table, id) {
        try{
            let result = await this.query(`SELECT *, HEX(id) as id FROM \`${table}\` WHERE id = UNHEX({{id}})`, {id});
            return result[0];
        } catch (e) {
            return null;
        }

    },
    insert(table, values) {
        return this.query(`INSERT INTO \`${table}\` SET ${this.generator(values)}`, values)
    },
    find(table, conditions) {
        return this.query(`SELECT *, HEX(id) as id FROM \`${table}\` WHERE ${this.generator(conditions, 'AND')}`, conditions)
    },
    update(table, changeObj){
        const strippedId = Object.assign({}, changeObj);
        delete strippedId.id;
        return this.query(`UPDATE \`${table}\` SET ${this.generator(strippedId, ' AND')} WHERE id = UNHEX({{id}})`, changeObj)
    },
    generator(objectValues, separator: string = ','): string {
        let generator = '';
        Object.keys(objectValues).forEach((key, i) => {
            generator += (i > 0 ? separator : '') + ` ${key} = ` + (key==='id' || key.includes('Id')?`UNHEX({{${key}}})`: `{{${key}}}`)
        })
        return generator.length < 1 ? '1=1' : generator;
    },
    prepare(sql: string, values: Object): Array<any> {
        const passIns: Array<any> = [];
        let matches = sql.match(/{{([\sa-z0-9_-]+)}}/ig);
        if(matches){
            matches.forEach(match => {
                const key = match.substring(2, match.length-2);
                if (typeof values[key] !== 'undefined') {
                    passIns.push(values[key])
                }
            })
        }

        return [sql.replace(/{{[\sa-z0-9_-]+}}/ig, '?'), passIns];
    }
}
