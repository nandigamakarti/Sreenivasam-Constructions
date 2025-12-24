import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from '@/components/ui/sheet';
import { 
  LayoutDashboard, 
  FolderKanban, 
  HandCoins, 
  Receipt, 
  Building2, 
  FileBarChart,
  Menu,
  LogOut,
  HardHat
} from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/projects', label: 'Projects', icon: FolderKanban },
  { path: '/contributions', label: 'Contributions', icon: HandCoins },
  { path: '/expenses', label: 'Expenses', icon: Receipt },
  { path: '/flats', label: 'Flats', icon: Building2 },
  { path: '/reports', label: 'Reports', icon: FileBarChart },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, adminEmail } = useAuth();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur border-b border-border">
        <div className="h-16 flex items-center justify-between px-4 md:px-6 lg:px-8">
          <Link to="/dashboard" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <HardHat className="h-7 w-7 text-primary" />
            <div className="leading-tight">
              <div className="font-display font-bold text-base text-foreground">Sree Nivasam Construction Projects</div>
              <div className="text-[11px] text-muted-foreground">Admin Portal</div>
            </div>
          </Link>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0">
              <div className="p-6">
                <SheetHeader>
                  <SheetTitle>Menu</SheetTitle>
                </SheetHeader>
                <div className="mt-6 space-y-2">
                  {navItems.map((item) => {
                    const isActive = location.pathname === item.path ||
                      (item.path !== '/dashboard' && location.pathname.startsWith(item.path));
                    return (
                      <SheetClose asChild key={item.path}>
                        <Link
                          to={item.path}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                            isActive
                              ? "bg-primary text-primary-foreground"
                              : "text-foreground/80 hover:text-foreground hover:bg-muted"
                          )}
                        >
                          <item.icon className="h-5 w-5" />
                          {item.label}
                        </Link>
                      </SheetClose>
                    );
                  })}
                </div>
              </div>

              <div className="border-t border-border p-6">
                <div className="text-xs text-muted-foreground mb-3 truncate">{adminEmail}</div>
                <SheetClose asChild>
                  <Button variant="outline" className="w-full justify-start" onClick={handleLogout}>
                    <LogOut className="h-4 w-4 mr-2" />
                    Logout
                  </Button>
                </SheetClose>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Content */}
      <main className="min-h-screen pt-16">
        <div className="p-4 md:p-6 lg:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}
