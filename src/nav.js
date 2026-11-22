import { House, Layers, MessageCircle, User, Users } from 'lucide-react';

// Each build step appends its tab here. Only built destinations belong in this list.
export const NAV = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/teams', label: 'Teams', icon: Layers },
  { to: '/profile', label: 'Profile', icon: User },
];
