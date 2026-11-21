/**
 * Primary navigation configuration.
 * Destinations use logical paths — URL utility applies the base at render time.
 */

import type { NavigationItem } from '../types/navigation';

/** Ordered primary navigation items. */
export const primaryNavigation: readonly NavigationItem[] = [
  { label: 'Home', href: '/', matchPattern: '/__home__' },
  { label: 'Photos', href: '/photos/', matchPattern: '/photos', categoryScope: 'photos', children: [
    { label: 'Family', href: '/photos/#family', categoryId: 'family' },
    { label: 'Scenery', href: '/photos/#scenery', categoryId: 'scenery' },
    { label: 'Moments', href: '/photos/#moments', categoryId: 'moments' },
    { label: 'Add album', href: '/photos/', addCategory: 'photos' },
  ] },
  { label: 'Video', href: '/music/', matchPattern: '/music', categoryScope: 'media', children: [
    { label: 'Favorite videos', href: '/music/?category=video', categoryId: 'video' },
    { label: 'Favorite music', href: '/music/?category=music', categoryId: 'music' },
    { label: 'Add video category', href: '/music/', addCategory: 'media' },
  ] },
  { label: 'Writing', href: '/knowledge/', matchPattern: '/knowledge', categoryScope: 'posts', children: [
    { label: 'Projects', href: '/projects/', matchPattern: '/projects', categoryId: 'projects' },
    { label: 'Series', href: '/series/', matchPattern: '/series', categoryId: 'series' },
    { label: 'Novels', href: '/novels/', matchPattern: '/novels', categoryId: 'novels' },
    { label: 'Add writing category', href: '/knowledge/', addCategory: 'posts' },
  ] },
  { label: 'About', href: '/about/', matchPattern: '/about', children: [
    { label: 'Introduction', href: '/about/', matchPattern: '/about' },
    { label: 'Resume', href: '/resume/', matchPattern: '/resume' },
  ] },
];

export const collectionNavigation: NavigationItem[] = [
  { label: 'Articles', href: '/articles/', matchPattern: '/articles' },
  { label: 'Notes', href: '/notes/', matchPattern: '/notes' },
  { label: 'Series', href: '/series/', matchPattern: '/series' },
  { label: 'Projects', href: '/projects/', matchPattern: '/projects' },
];
