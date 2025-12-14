import { Outlet } from 'react-router-dom';
import { Header } from './Header';

export function Layout() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <footer className="bg-gray-900 border-t border-gray-800 py-4">
        <div className="container mx-auto px-4 text-center text-sm text-gray-500">
          <p>Tacticus Damage Calculator - Not affiliated with Snowprint Studios</p>
        </div>
      </footer>
    </div>
  );
}
