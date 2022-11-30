// const wait = require('node:timers/promises').setTimeout;
const { SlashCommandBuilder } = require('discord.js');
const { Server } = require('@fabricio-191/valve-server-query');


module.exports = {
	data: new SlashCommandBuilder()
		.setName('online')
		.setDescription('Shows the online players.'),
	async execute(interaction) {
		const server = await Server({
			ip: 'valheim.sdev.lv',
			port: 2457,
			timeout: 60000,
		});

		const playerList = await server.getPlayers()
			.then(players => {

				return players.length;
			})
			.catch(err => {
				console.error(err);
			},
			);

		await interaction.reply(`There are ${playerList} players in the server`);
	},
};