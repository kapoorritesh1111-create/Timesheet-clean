'use client';
import { useState } from 'react';
import { supabase } from "../../../lib/supabaseBrowser";
import { useRouter } from 'next/navigation';

export default function NewEntry(){
  const router = useRouter();
  const [date,setDate]=useState('');
  const [timeIn,setTimeIn]=useState('09:00');
  const [timeOut,setTimeOut]=useState('17:00');

  async function save(e:any){
    e.preventDefault();
    const { data:session } = await supabase.auth.getSession();
    const user = session.session?.user;
    const { data:profile } = await supabase.from('profiles').select('org_id').single();

    await supabase.from('time_entries').insert({
      org_id: profile?.org_id,
      user_id: user?.id,
      entry_date: date,
      time_in: timeIn,
      time_out: timeOut,
      lunch_hours: 0.5,
      status: 'draft'
    });

    router.push('/dashboard');
  }

  return (
    <form onSubmit={save}>
      <h2>New Entry</h2>
      <input type="date" onChange={e=>setDate(e.target.value)} />
      <input type="time" value={timeIn} onChange={e=>setTimeIn(e.target.value)} />
      <input type="time" value={timeOut} onChange={e=>setTimeOut(e.target.value)} />
      <button>Save</button>
    </form>
  );
}
