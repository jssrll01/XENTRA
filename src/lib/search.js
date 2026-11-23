import { searchPeopleRpc } from './api';

export async function searchPeople(term) {
  return searchPeopleRpc(term);
}
