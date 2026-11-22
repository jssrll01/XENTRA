import { House, MessageCircle, User, Users } from 'lucide-react';

// Each build step appends its tab here. Only built destinations belong in this list.
export const NAV = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/contacts', label: 'Contacts', icon: Users },
  { to: '/profile', label: 'Profile', icon: User },
];
