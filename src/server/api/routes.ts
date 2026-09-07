import { Router } from '../http/router.ts';
import { handleCreateDecision, handleSubjective } from './decisionsRoute.ts';
import { handleCreateFeedback } from './feedbackRoute.ts';
import { handleGetHistory } from './historyRoute.ts';
import { handleGetMetrics } from './metricsRoute.ts';
import { handleDeleteProfile, handleGetProfile, handlePutProfile } from './profileRoute.ts';
import { handleGetPlace } from './placesRoute.ts';
import { handlePostEvents } from './eventsRoute.ts';
import { handleRecommend } from './recommendRoute.ts';
import type { Deps } from './deps.ts';

/** One responsibility per module; this file only wires them to paths. */
export function buildRouter(deps: Deps): Router {
  const router = new Router();

  router.post('/api/recommend', handleRecommend(deps));
  router.get('/api/places/:id', handleGetPlace(deps));
  router.post('/api/decisions', handleCreateDecision(deps));
  router.post('/api/feedback', handleCreateFeedback(deps));
  router.get('/api/history', handleGetHistory(deps));
  router.get('/api/profile', handleGetProfile(deps));
  router.put('/api/profile', handlePutProfile(deps));
  router.delete('/api/profile', handleDeleteProfile(deps));
  router.post('/api/events', handlePostEvents(deps));
  router.post('/api/subjective', handleSubjective(deps));
  router.get('/api/metrics', handleGetMetrics(deps));
  router.get('/api/config', () => ({ mapProvider: deps.config.mapProvider }));

  return router;
}
