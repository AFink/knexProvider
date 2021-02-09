const SettingProvider = require('discord.js-commando').SettingProvider;
/**
 * Uses knex to store settings with guilds
 * @extends {SettingProvider}
 */
class KnexProvider extends SettingProvider {
    /**
     * @param {knex} knex - Database Connection for the provider
     */
    constructor(knex) {
        super();

        /**
         * Database that will be used for storing/retrieving settings
         * @type {knex}
         */
        this.knex = knex;

        /**
         * Client that the provider is for (set once the client is ready, after using {@link CommandoClient#setProvider})
         * @name KnexProvider#client
         * @type {CommandoClient}
         * @readonly
         */
        Object.defineProperty(this, 'client', {
            value: null,
            writable: true
        });

        /**
         * Settings cached in memory, mapped by guild ID (or 'global')
         * @type {Map}
         * @private
         */
        this.settings = new Map();

        /**
         * Listeners on the Client, mapped by the event name
         * @type {Map}
         * @private
         */
        this.listeners = new Map();

        /**
         * Prepared statement to insert or replace a settings row
         * @type {SyncSQLiteStatement}
         * @private
         */
        this.insertOrReplaceStmt = null;

        /**
         * Prepared statement to delete an entire settings row
         * @type {SyncSQLiteStatement}
         * @private
         */
        this.deleteStmt = null;

        this.options = {
            tableName: "settings"
        };

        this.columns = [];
    }

    async init(client) {
        this.client = client;

        if (!await this.knex.schema.hasTable(this.options.tableName)) {
            await this.knex.schema.createTable(this.options.tableName, function (table) {
                table.string('guild').primary();
                table.timestamps(false, true);
            });
        }

        let colInfo = await this.knex(this.options.tableName).columnInfo();
        for (const [key, value] of Object.entries(colInfo)) {
            this.columns.push(key);
        }

        // Load all settings
        //const rows = this.conn.prepare('SELECT CAST(guild as TEXT) as guild, settings FROM settings').all();
        /* const rows = await this.knex(this.options.tableName).select();


         for (const row of rows) {
             let settings = this.formatRow(row);

             const guild = row.guild !== '0' ? row.guild : 'global';
             this.settings.set(guild, settings);
             if (guild !== 'global' && !client.guilds.cache.has(row.guild)) continue;
             this.setupGuild(guild, settings);
         } */

        let all = await this.all();

        all.forEach((settings, guild) => this.setupGuild(guild, settings));

        // Prepare statements
        //this.insertOrReplaceStmt = this.conn.prepare('INSERT OR REPLACE INTO settings VALUES(?, ?)');
        //this.deleteStmt = this.conn.prepare('DELETE FROM settings WHERE guild = ?');

        // Listen for changes
        this.listeners
            .set('commandPrefixChange', (guild, prefix) => this.set(guild, 'prefix', prefix))
            .set('commandStatusChange', (guild, command, enabled) => this.set(guild, `cmd-${command.name}`, enabled))
            .set('groupStatusChange', (guild, group, enabled) => this.set(guild, `grp-${group.id}`, enabled))
            .set('guildCreate', guild => {
                //const settings = this.settings.get(guild.id);
                const settings = this.get(guild);
                if (!settings) return;
                this.setupGuild(guild.id, settings);
            })
            .set('commandRegister', async command => {
                /*for (const [guild, settings] of this.settings) {
                    if (guild !== 'global' && !client.guilds.cache.has(guild)) continue;
                    this.setupGuildCommand(client.guilds.cache.get(guild), command, settings);
                } */
                let all = await this.all();
                for (const [guild, settings] of all) {
                    if (guild !== 'global' && !client.guilds.cache.has(guild)) continue;
                    this.setupGuildCommand(client.guilds.cache.get(guild), command, settings);
                }
            })
            .set('groupRegister', async group => {
                /*for (const [guild, settings] of this.settings) {
                    if (guild !== 'global' && !client.guilds.cache.has(guild)) continue;
                    this.setupGuildGroup(client.guilds.cache.get(guild), group, settings);
                } */
                let all = await this.all();
                for (const [guild, settings] of all) {
                    if (guild !== 'global' && !client.guilds.cache.has(guild)) continue;
                    this.setupGuildGroup(client.guilds.cache.get(guild), group, settings);
                }
            });
        for (const [event, listener] of this.listeners) client.on(event, listener);
    }

    destroy() {
        // Remove all listeners from the client
        for (const [event, listener] of this.listeners) this.client.removeListener(event, listener);
        this.listeners.clear();
    }

    async all() {
        const result = await this.knex(this.options.tableName);
        let settings = new Map();

        result.forEach(row => {
            const guild = row.guild !== '0' ? row.guild : 'global';
            settings.set(guild, this.formatRow(row));
        });
        return settings;
    }


    async get(guild, key, defVal = null) {
        guild = this.constructor.getGuildID(guild);
        //const settings = this.settings.get(this.constructor.getGuildID(guild));
        const result = await this.knex(this.options.tableName).where({
            guild: guild
        });
        let settings = this.formatRow(result[0]);

        return settings ? typeof settings[key] !== 'undefined' ? settings[key] : defVal : defVal;
    }

    async set(guild, key, val) {
        guild = this.constructor.getGuildID(guild);
        /*let settings = this.settings.get(guild);
        if (!settings) {
            settings = {};
            this.settings.set(guild, settings);
        }
        settings[key] = val; */

        await this.insertOrUpdate(guild !== 'global' ? guild : 0, key, val);

        // if (guild === 'global') this.updateOtherShards(key, val);
        return val;
    }

    async remove(guild, key) {
        guild = this.constructor.getGuildID(guild);
        const val = await this.get(guild, key);
        /*const settings = this.settings.get(guild);
        if (!settings || typeof settings[key] === 'undefined') return undefined;

        const val = settings[key];
        settings[key] = undefined; */

        await this.insertOrUpdate(guild !== 'global' ? guild : 0, key, null);

        // if (guild === 'global') this.updateOtherShards(key, undefined);
        return val;
    }

    async clear(guild) {
        guild = this.constructor.getGuildID(guild);
        /* if (!this.settings.has(guild)) return;
        this.settings.delete(guild); */

        return await this.knex(this.options.tableName).where({
            guild: guild !== 'global' ? guild : 0
        }).del();
    }

    /**
     * Loads all settings for a guild
     * @param {string} guild - Guild ID to load the settings of (or 'global')
     * @param {Object} settings - Settings to load
     * @private
     */
    setupGuild(guild, settings) {
        if (typeof guild !== 'string') throw new TypeError('The guild must be a guild ID or "global".');
        guild = this.client.guilds.cache.get(guild) || null;

        // Load the command prefix
        if (typeof settings.prefix !== 'undefined') {
            if (guild) guild._commandPrefix = settings.prefix;
            else this.client._commandPrefix = settings.prefix;
        }

        // Load all command/group statuses
        for (const command of this.client.registry.commands.values()) this.setupGuildCommand(guild, command, settings);
        for (const group of this.client.registry.groups.values()) this.setupGuildGroup(guild, group, settings);
    }

    /**
     * Sets up a command's status in a guild from the guild's settings
     * @param {?CommandoGuild} guild - Guild to set the status in
     * @param {Command} command - Command to set the status of
     * @param {Object} settings - Settings of the guild
     * @private
     */
    setupGuildCommand(guild, command, settings) {
        if (typeof settings[`cmd-${command.name}`] === 'undefined') return;
        if (guild) {
            if (!guild._commandsEnabled) guild._commandsEnabled = {};
            guild._commandsEnabled[command.name] = settings[`cmd-${command.name}`] == "1";
        } else {
            command._globalEnabled = settings[`cmd-${command.name}`] == "1";
        }
    }

    /**
     * Sets up a command group's status in a guild from the guild's settings
     * @param {?CommandoGuild} guild - Guild to set the status in
     * @param {CommandGroup} group - Group to set the status of
     * @param {Object} settings - Settings of the guild
     * @private
     */
    setupGuildGroup(guild, group, settings) {
        if (typeof settings[`grp-${group.id}`] === 'undefined') return;
        if (guild) {
            if (!guild._groupsEnabled) guild._groupsEnabled = {};
            guild._groupsEnabled[group.id] = settings[`grp-${group.id}`] == "1";
        } else {
            group._globalEnabled = settings[`grp-${group.id}`] == "1";
        }
    }

    /**
     * Updates a global setting on all other shards if using the {@link ShardingManager}.
     * @param {string} key - Key of the setting to update
     * @param {*} val - Value of the setting
     * @private
     */
    updateOtherShards(key, val) {
        if (!this.client.shard) return;
        key = JSON.stringify(key);
        val = typeof val !== 'undefined' ? JSON.stringify(val) : 'undefined';
        this.client.shard.broadcastEval(`
			const ids = [${this.client.shard.ids.join(',')}];
			if(!this.shard.ids.some(id => ids.includes(id)) && this.provider && this.provider.settings) {
				let global = this.provider.settings.get('global');
				if(!global) {
					global = {};
					this.provider.settings.set('global', global);
				}
				global[${key}] = ${val};
			}
		`);
    }

    async insertOrUpdate(guild, key, value) {
        if (!this.columns.includes(key)) {
            await this.knex.schema.table(this.options.tableName, function (table) {
                table.string(key);
            });
            this.columns.push(key);
        }

        let count = await this.knex(this.options.tableName).where({
            guild: guild
        }).count('*', {
            as: "count"
        });
        if (count[0].count > 0) {
            let update = {};
            update[key] = value;
            return await this.knex(this.options.tableName).where({
                guild: guild
            }).update(update);
        } else {
            let insert = {
                guild: guild
            };
            insert[key] = value;
            return await this.knex(this.options.tableName)
                .insert(insert);
        }

    }

    formatRow(result) {
        delete result.guild;
        delete result.created_at;
        delete result.updated_at;

        let settings = {};
        for (const [key, value] of Object.entries(result)) {
            settings[key] = value == null ? undefined : value;
        }
        return settings;
    }
}

module.exports = KnexProvider;