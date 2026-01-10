import { Link } from 'react-router-dom';
import { Users, Calculator, Map } from 'lucide-react';

export function HomePage() {
  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-4xl sm:text-5xl font-display font-bold text-imperial-gold mb-4">
          Tacticus Damage Calculator
        </h1>
        <p className="text-xl text-gray-400 max-w-2xl mx-auto">
          Plan and optimize your Guild Raid team compositions with accurate damage calculations
        </p>
      </div>

      {/* Feature Cards */}
      <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
        <Link to="/characters" className="card p-6 group">
          <div className="w-14 h-14 rounded-lg bg-blue-900/30 flex items-center justify-center mb-4 group-hover:bg-blue-900/50 transition-colors">
            <Users size={28} className="text-blue-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">Character Database</h2>
          <p className="text-gray-400">
            Browse all Tacticus characters with detailed stats and abilities pulled from the Wiki
          </p>
        </Link>

        <Link to="/calculator" className="card p-6 group">
          <div className="w-14 h-14 rounded-lg bg-amber-900/30 flex items-center justify-center mb-4 group-hover:bg-amber-900/50 transition-colors">
            <Calculator size={28} className="text-amber-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">Damage Calculator</h2>
          <p className="text-gray-400">
            Build a team of 5 characters and simulate 6-turn Guild Raid battles
          </p>
        </Link>

        <Link to="/strategium" className="card p-6 group">
          <div className="w-14 h-14 rounded-lg bg-emerald-900/30 flex items-center justify-center mb-4 group-hover:bg-emerald-900/50 transition-colors">
            <Map size={28} className="text-emerald-400" />
          </div>
          <h2 className="text-xl font-semibold text-gray-100 mb-2">Strategium</h2>
          <p className="text-gray-400">
            Plan character positions and movements across a 6-turn Guild Raid battle
          </p>
        </Link>
      </div>

      {/* How It Works */}
      <div className="card p-8">
        <h2 className="text-2xl font-display font-semibold text-imperial-gold mb-6 text-center">
          How It Works
        </h2>
        <div className="grid sm:grid-cols-3 gap-8">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-imperial-gold text-gray-900 flex items-center justify-center font-bold text-lg mx-auto mb-3">
              1
            </div>
            <h3 className="font-semibold text-gray-100 mb-2">Browse Characters</h3>
            <p className="text-sm text-gray-400">
              Explore the character database and view stats and abilities
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-imperial-gold text-gray-900 flex items-center justify-center font-bold text-lg mx-auto mb-3">
              2
            </div>
            <h3 className="font-semibold text-gray-100 mb-2">Build Your Team</h3>
            <p className="text-sm text-gray-400">
              Select up to 5 characters for your Guild Raid team
            </p>
          </div>
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-imperial-gold text-gray-900 flex items-center justify-center font-bold text-lg mx-auto mb-3">
              3
            </div>
            <h3 className="font-semibold text-gray-100 mb-2">Simulate Battle</h3>
            <p className="text-sm text-gray-400">
              Run a 6-turn simulation and optimize your damage output
            </p>
          </div>
        </div>
      </div>

      {/* Data Source */}
      <div className="text-center text-sm text-gray-500">
        <p>
          Character data sourced from{' '}
          <a
            href="https://tacticus.wiki.gg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-imperial-gold hover:underline"
          >
            Tacticus Wiki
          </a>
        </p>
      </div>
    </div>
  );
}
