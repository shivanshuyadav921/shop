import { v4 as uuidv4 } from 'uuid';
import pino from 'pino';

/**
 * Fraud graph analysis for dealer/ring fraud detection
 * Identifies relationships between merchants, devices, and users
 */

export interface GraphNode {
  id: string;
  type: 'merchant' | 'user' | 'device' | 'ip' | 'card';
  label: string;
  riskScore: number;
  flagged: boolean;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  id: string;
  source: string; // Node ID
  target: string; // Node ID
  relationshipType: string; // "transaction", "shared_device", "shared_ip"
  weight: number; // Strength of relationship
  transactionCount: number;
  totalAmount: string;
  lastInteraction: Date;
}

export interface FraudCluster {
  clusterId: string;
  nodes: string[];
  edges: string[];
  suspectedFraudType: string;
  confidence: number;
  detectedAt: Date;
}

export class FraudGraphAnalyzer {
  private nodes: Map<string, GraphNode> = new Map();
  private edges: Map<string, GraphEdge> = new Map();
  private clusters: Map<string, FraudCluster> = new Map();
  private logger: pino.Logger;

  constructor(logger?: pino.Logger) {
    this.logger = logger || pino();
  }

  /**
   * Add or update node in fraud graph
   */
  addNode(
    nodeType: GraphNode['type'],
    identifier: string,
    label: string,
    metadata?: Record<string, any>
  ): GraphNode {
    const nodeId = `${nodeType}:${identifier}`;

    let node = this.nodes.get(nodeId);

    if (!node) {
      node = {
        id: nodeId,
        type: nodeType,
        label,
        riskScore: 0,
        flagged: false,
        metadata,
      };

      this.nodes.set(nodeId, node);
      this.logger.debug(`Added node to fraud graph: ${nodeId}`);
    } else {
      node.metadata = { ...node.metadata, ...metadata };
    }

    return node;
  }

  /**
   * Add edge between nodes (represents transaction or relationship)
   */
  addEdge(
    sourceType: GraphNode['type'],
    sourceId: string,
    targetType: GraphNode['type'],
    targetId: string,
    relationshipType: string,
    amount?: string
  ): GraphEdge {
    const sourceNodeId = `${sourceType}:${sourceId}`;
    const targetNodeId = `${targetType}:${targetId}`;
    const edgeKey = `${sourceNodeId}-${targetNodeId}`;

    let edge = this.edges.get(edgeKey);

    if (!edge) {
      edge = {
        id: `edge_${uuidv4()}`,
        source: sourceNodeId,
        target: targetNodeId,
        relationshipType,
        weight: 1,
        transactionCount: 1,
        totalAmount: amount || '0',
        lastInteraction: new Date(),
      };

      this.edges.set(edgeKey, edge);
    } else {
      // Update existing edge
      edge.weight++;
      edge.transactionCount++;
      if (amount) {
        const current = parseFloat(edge.totalAmount);
        const additional = parseFloat(amount);
        edge.totalAmount = (current + additional).toString();
      }
      edge.lastInteraction = new Date();
    }

    return edge;
  }

  /**
   * Flag node as suspicious
   */
  flagNode(nodeId: string, riskScore: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.flagged = true;
      node.riskScore = Math.max(node.riskScore, riskScore);

      // Propagate risk to connected nodes
      this.propagateRisk(nodeId, riskScore);

      this.logger.warn(`Flagged node: ${nodeId} (risk: ${riskScore})`);
    }
  }

  /**
   * Detect fraud clusters in graph
   */
  detectClusters(): FraudCluster[] {
    const detectedClusters: FraudCluster[] = [];

    // Simple clustering: find densely connected subgraphs with high-risk nodes
    const visited = new Set<string>();

    for (const nodeId of this.nodes.keys()) {
      if (visited.has(nodeId)) continue;

      const node = this.nodes.get(nodeId);
      if (!node || !node.flagged) continue;

      // Start BFS from flagged node
      const cluster = this.performBFS(nodeId, visited);

      if (cluster.nodes.length > 2) {
        // Only consider clusters with 3+ nodes as suspicious
        const fraudCluster: FraudCluster = {
          clusterId: `cluster_${uuidv4()}`,
          nodes: cluster.nodes,
          edges: cluster.edges,
          suspectedFraudType: this.analyzeFraudType(cluster.nodes),
          confidence: this.calculateClusterConfidence(cluster),
          detectedAt: new Date(),
        };

        this.clusters.set(fraudCluster.clusterId, fraudCluster);
        detectedClusters.push(fraudCluster);

        this.logger.warn(
          `Detected fraud cluster: ${fraudCluster.clusterId} (${cluster.nodes.length} nodes, confidence: ${fraudCluster.confidence.toFixed(2)})`
        );
      }
    }

    return detectedClusters;
  }

  /**
   * Perform BFS for cluster detection
   */
  private performBFS(
    startNodeId: string,
    visited: Set<string>
  ): { nodes: string[]; edges: string[] } {
    const queue = [startNodeId];
    const nodes = [startNodeId];
    const edges: string[] = [];

    visited.add(startNodeId);

    while (queue.length > 0) {
      const current = queue.shift()!;

      // Find connected edges
      for (const edge of this.edges.values()) {
        if (edge.source === current || edge.target === current) {
          edges.push(edge.id);

          const neighbor = edge.source === current ? edge.target : edge.source;

          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            nodes.push(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Analyze suspected fraud type
   */
  private analyzeFraudType(nodeIds: string[]): string {
    // Count node types
    const typeCount: Record<string, number> = {};

    for (const nodeId of nodeIds) {
      const type = nodeId.split(':')[0];
      typeCount[type] = (typeCount[type] || 0) + 1;
    }

    // Determine fraud pattern
    if (typeCount['card'] && typeCount['card'] > 3) {
      return 'card_testing_ring';
    } else if (typeCount['merchant'] && typeCount['merchant'] > 3) {
      return 'dealer_collusion';
    } else if (typeCount['ip'] && typeCount['ip'] > 2 && typeCount['device'] && typeCount['device'] > 2) {
      return 'multi_account_abuse';
    } else {
      return 'suspicious_pattern';
    }
  }

  /**
   * Calculate cluster confidence
   */
  private calculateClusterConfidence(cluster: { nodes: string[]; edges: string[] }): number {
    let riskSum = 0;

    for (const nodeId of cluster.nodes) {
      const node = this.nodes.get(nodeId);
      if (node) {
        riskSum += node.riskScore;
      }
    }

    const avgRisk = riskSum / cluster.nodes.length;

    // Higher average risk = higher confidence in cluster being fraudulent
    return Math.min(1, avgRisk / 100);
  }

  /**
   * Propagate risk to connected nodes
   */
  private propagateRisk(nodeId: string, initialRisk: number): void {
    const visited = new Set<string>();
    const queue: Array<{ nodeId: string; risk: number }> = [{ nodeId, risk: initialRisk }];

    while (queue.length > 0) {
      const { nodeId: currentNodeId, risk: currentRisk } = queue.shift()!;

      if (visited.has(currentNodeId) || currentRisk < 10) continue;

      visited.add(currentNodeId);

      const node = this.nodes.get(currentNodeId);
      if (node) {
        node.riskScore = Math.max(node.riskScore, currentRisk * 0.8); // Decay risk with distance
      }

      // Find connected nodes
      for (const edge of this.edges.values()) {
        if (edge.source === currentNodeId || edge.target === currentNodeId) {
          const neighbor = edge.source === currentNodeId ? edge.target : edge.source;
          queue.push({ nodeId: neighbor, risk: currentRisk * 0.8 });
        }
      }
    }
  }

  /**
   * Get node by ID
   */
  getNode(nodeId: string): GraphNode | null {
    return this.nodes.get(nodeId) || null;
  }

  /**
   * Get cluster by ID
   */
  getCluster(clusterId: string): FraudCluster | null {
    return this.clusters.get(clusterId) || null;
  }

  /**
   * Get all clusters
   */
  getAllClusters(): FraudCluster[] {
    return Array.from(this.clusters.values());
  }
}

export default FraudGraphAnalyzer;
