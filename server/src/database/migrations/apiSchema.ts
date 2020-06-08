import Knex from 'knex';

export async function up(knex: Knex) {
  return knex.schema.createTable('apis', table => {
    table.increments('id').primary();
    table.string('apiName').notNullable();
    table.string('description').notNullable();
    table.string('mainUrl').notNullable();
    table.string('documentationUrl');
  });
}

export async function down(knex: Knex) {
  return knex.schema.dropTable('apis')
}
