const assert = require('node:assert/strict');
const handler = require('../api/ranking.js');
process.env.MONDAY_API_TOKEN = 'test-token';
const body = (data) => ({ ok: true, json: async () => ({ data }) });
const mk = (id, fields) => ({ id, name: `Lead ${id}`, column_values: Object.entries(fields).map(([id,text]) => ({ id, text, value:null })) });
const main = [mk('1',{color_mm5h9nnn:'Jhonattan Paes',date_mm57xz4a:'2026-10-12',date_mm57ge7a:'2026-10-10'}),mk('2',{color_mm5h9nnn:'Tiago Silva',date_mm57ge7a:'2026-10-10'})];
global.fetch = async (_, {body: payload}) => {
  const { query, variables } = JSON.parse(payload);
  if (query.includes('settings_str')) return body({ boards:[{ columns:[{id:'color_mm5h9nnn',settings_str:JSON.stringify({labels:[{label:'Jhonattan Paes',is_deactivated:false},{label:'Tiago Silva',is_deactivated:false},{label:'Antigo',is_deactivated:true}]})}] }] });
  if (String(variables.id) === '18428438591') return body({boards:[{items_page:{cursor:null,items:main}}]});
  if (String(variables.id) === '18431520161') return body({boards:[{items_page:{cursor:null,items:[mk('3',{status:'Tiago Silva',date4:'2026-10-10'})]}}]});
  if (String(variables.id) === '18431548138') return body({boards:[{items_page:{cursor:null,items:[mk('4',{single_selecthvi7b44:'Tiago Silva',date4:'2026-10-11',single_selects5s08f2:'Agendamento'})]}}]});
  throw Error('unexpected query');
};
(async () => {
  let value, status;
  await handler({method:'GET',query:{month:'2026-10'}},{setHeader(){},status(s){status=s;return this},json(v){value=v;return v}});
  assert.equal(status,200);
  assert.deepEqual(value.ranking.map(r=>r.name),['Jhonattan Paes','Tiago Silva']);
  assert.equal(value.ranking.length,2);
  assert.equal(value.ranking[0].vendas,1);
  assert.equal(value.ranking[1].pastas,1);
  assert.equal(value.ranking[1].agendamentos,1);
  assert.equal(value.complete,true);
  console.log('PASS: ordenação, filtro de responsáveis e integração de quadros');
})().catch(e=>{console.error(e);process.exitCode=1});
