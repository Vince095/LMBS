/**
 * Layout — shared sidebar + topbar shell used by every GovTech route.
 */

import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';

export default function Layout() {
    return (
        <div className="min-h-screen flex bg-surface text-on-surface font-public-sans">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0">
                <TopBar />
                <main className="flex-1 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
