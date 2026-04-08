import { Router } from 'express';
import ehrRoutes from './ehr.routes';
import permissionRoutes from './permission.routes';
import auditRoutes from './audit.routes';
import vaccinationRoutes from './vaccination.routes';
import pdfRoutes from './pdf.routes';

const router = Router();

// Health check – used by API Gateway and load balancers
router.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'ehr-service', timestamp: new Date().toISOString() });
});

// Mount domain routes
router.use('/ehr', ehrRoutes);
router.use('/ehr', permissionRoutes);
router.use('/ehr', auditRoutes);
router.use('/ehr', vaccinationRoutes);
router.use('/ehr', pdfRoutes);

export default router;
