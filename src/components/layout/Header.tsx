import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Users, Calculator, Home } from 'lucide-react';
import { useState } from 'react';
import { useTeamStore } from '../../stores/teamStore';

export function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { team } = useTeamStore();

  const navLinks = [
    { to: '/', label: 'Home', icon: Home },
    { to: '/characters', label: 'Characters', icon: Users },
    { to: '/calculator', label: 'Calculator', icon: Calculator, badge: team.length || undefined },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="bg-gray-900 border-b border-gray-800 sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <span className="text-xl font-display font-bold text-imperial-gold">
              Tacticus
            </span>
            <span className="text-xl font-display text-gray-400">Calc</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isActive(link.to)
                    ? 'bg-gray-800 text-imperial-gold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <link.icon size={18} />
                {link.label}
                {link.badge && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs bg-imperial-gold text-gray-900 rounded-full font-semibold">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-gray-200"
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {isMobileMenuOpen && (
          <nav className="md:hidden py-4 border-t border-gray-800">
            {navLinks.map((link) => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setIsMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  isActive(link.to)
                    ? 'bg-gray-800 text-imperial-gold'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <link.icon size={20} />
                {link.label}
                {link.badge && (
                  <span className="ml-auto px-2 py-0.5 text-xs bg-imperial-gold text-gray-900 rounded-full font-semibold">
                    {link.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        )}
      </div>
    </header>
  );
}
