import React from 'react';
import PlannerPage from '../components/PlannerPage';
import TodoWidget from '../components/TodoWidget';

export default function PlannerTodo() {
  return <PlannerPage title="To-do"><TodoWidget /></PlannerPage>;
}
