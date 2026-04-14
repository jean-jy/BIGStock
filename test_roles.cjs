const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function testRoles() {
  const roles = ['Admin', 'Branch Manager', 'Manager', 'Staff'];
  for (const role of roles) {
    const { error } = await supabase.from('profiles').insert([
      { id: '00000000-0000-0000-0000-000000000000', full_name: 'test', email: 'test@test.com', role: role }
    ]);
    console.log(`Role '${role}' error:`, error ? error.message : 'SUCCESS');
  }
}
testRoles();
