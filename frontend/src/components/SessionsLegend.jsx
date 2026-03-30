import { Clock } from 'lucide-react';
import { getCurrentSession } from '../utils/smc';

const SESSIONS = [
  { name: 'Asia',             hours: '00:00–09:00 UTC', color: 'bg-blue-500/70'  },
  { name: 'London',           hours: '07:00–16:00 UTC', color: 'bg-emerald-500/70' },
  { name: 'London/NY Overlap',hours: '12:00–16:00 UTC', color: 'bg-yellow-500/70' },
  { name: 'New York',         hours: '12:00–21:00 UTC', color: 'bg-orange-500/70' },
];

export default function SessionsLegend({ inline = false }) {
  const currentSession = getCurrentSession();
  const now = new Date();
  const utcTime = now.toISOString().slice(11, 16) + ' UTC';

  if (inline) {
    return (
      <div className="flex items-center gap-2">
        <Clock size={11} className="text-gray-600" />
        <span className="text-gray-600 text-xs">{utcTime}</span>
        <span className="text-yellow-500 font-semibold text-xs">{currentSession}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-dark-800 border-b border-dark-600">
      <div className="flex items-center gap-1 text-gray-500 text-xs">
        <Clock size={12} />
        <span>{utcTime}</span>
      </div>

      <div className="flex items-center gap-2">
        {SESSIONS.map(session => {
          const isActive = currentSession.includes(session.name) ||
            (session.name === 'London/NY Overlap' && currentSession === 'London/NY Overlap');
          return (
            <div
              key={session.name}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-xs transition-all ${
                isActive
                  ? 'bg-dark-600 ring-1 ring-white/20'
                  : 'opacity-50'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${session.color}`} />
              <span className={isActive ? 'text-white font-semibold' : 'text-gray-500'}>
                {session.name}
              </span>
              {isActive && (
                <span className="text-green-400 text-xs font-bold animate-pulse">LIVE</span>
              )}
            </div>
          );
        })}
      </div>

      <div className="ml-auto text-xs">
        <span className="text-gray-500">Active: </span>
        <span className="text-white font-semibold">{currentSession}</span>
      </div>
    </div>
  );
}
