import { House, MessageCircle, User } from 'lucide-react';

// Each build step appends its tab here. Only built destinations belong in this list.
export const NAV = [
  { to: '/home', label: 'Home', icon: House },
  { to: '/messages', label: 'Messages', icon: MessageCircle },
  { to: '/profile', label: 'Profile', icon: User },
];
