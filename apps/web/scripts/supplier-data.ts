// Seed dataset for the two demo organizations. Capability copy reads like real
// vendor descriptions across fabrication, logistics, industrial chemicals, IT
// hardware, facilities, and professional services. Regions and certifications
// included. No placeholder text.

export interface SeedSupplier {
  name: string;
  capabilities: string;
  region: string;
  certifications: string[];
}

export interface SeedOrg {
  orgCode: string;
  orgName: string;
  suppliers: SeedSupplier[];
}

// Org A is the real Kinde org the demo agents belong to (their M2M tokens carry
// this org_code), so an agent search resolves to this supplier set.
export const ORG_A_CODE = 'org_d26a1b1345f3d';
// Org B is a second tenant used to prove cross-org isolation.
export const ORG_B_CODE = 'org_7c4a9e2f1b60';

export const SEED_ORGS: SeedOrg[] = [
  {
    orgCode: ORG_A_CODE,
    orgName: 'Meridian Procurement Group',
    suppliers: [
      {
        name: 'Ironclad Structural Fabrication',
        capabilities:
          'Heavy structural steel fabrication and erection, submerged-arc and MIG welding of plate girders, CNC plasma and oxy-fuel cutting, and shop priming for bridge and industrial building components.',
        region: 'US-Midwest',
        certifications: ['AWS D1.1', 'AISC Certified', 'ISO 9001:2015']
      },
      {
        name: 'Polar Route Freight Systems',
        capabilities:
          'Refrigerated and reefer trucking with pharmaceutical-grade cold-chain handling, continuous thermal monitoring, validated dry-ice packouts, and last-mile reefer delivery for perishable and biologic cargo.',
        region: 'US-Midwest',
        certifications: ['GDP', 'FSMA', 'ISO 9001:2015']
      },
      {
        name: 'Continental Bulk Logistics',
        capabilities:
          'Full-truckload and intermodal freight, port drayage, bonded warehousing, and nationwide distribution with EDI shipment tracking and pool distribution for palletized dry goods.',
        region: 'US-National',
        certifications: ['SmartWay', 'C-TPAT', 'ISO 28000']
      },
      {
        name: 'Halcyon Specialty Chemicals',
        capabilities:
          'Manufacture and custom blending of industrial solvents, surfactants, and defoamers, with toll processing, drum and IBC filling, and REACH-compliant safety documentation.',
        region: 'US-Gulf Coast',
        certifications: ['Responsible Care', 'ISO 14001', 'REACH']
      },
      {
        name: 'Redwood IT Infrastructure',
        capabilities:
          'Enterprise server and storage supply, top-of-rack switching, structured cabling, and data-center build-outs including PDU and rack integration with staging and asset tagging.',
        region: 'US-West',
        certifications: ['ISO 27001', 'Cisco Gold Partner']
      },
      {
        name: 'Summit Facilities Management',
        capabilities:
          'Integrated facilities management covering janitorial, HVAC preventive maintenance, grounds keeping, and 24/7 reactive repair across multi-site industrial campuses.',
        region: 'US-Mountain',
        certifications: ['ISO 41001', 'OSHA VPP']
      },
      {
        name: 'Cardinal Professional Services',
        capabilities:
          'Contract engineering staffing, capital project management consulting, and regulatory compliance advisory for manufacturing and energy clients.',
        region: 'US-Northeast',
        certifications: ['ISO 9001:2015']
      },
      {
        name: 'Apex Precision Machining',
        capabilities:
          'CNC milling and turning to aerospace tolerances, five-axis machining of titanium and Inconel, rapid prototyping, and first-article inspection reporting.',
        region: 'US-West',
        certifications: ['AS9100D', 'NADCAP', 'ISO 9001:2015']
      },
      {
        name: 'BlueRiver Water Treatment',
        capabilities:
          'Industrial wastewater treatment systems, membrane filtration and reverse-osmosis skids, chemical dosing automation, and discharge-permit compliance monitoring.',
        region: 'US-Southeast',
        certifications: ['NSF/ANSI 61', 'ISO 14001']
      },
      {
        name: 'Vanguard Electrical Systems',
        capabilities:
          'Industrial electrical contracting, medium-voltage switchgear installation, custom UL-listed control panels, and PLC and motor-control integration for automated lines.',
        region: 'US-Midwest',
        certifications: ['UL 508A', 'NECA Member']
      },
      {
        name: 'Sterling Packaging Solutions',
        capabilities:
          'Corrugated and die-cut packaging design, contract co-packing and kitting, and recyclable mono-material formats with FSC-certified board stock.',
        region: 'US-Southeast',
        certifications: ['FSC Chain of Custody', 'SQF']
      },
      {
        name: 'Beacon Calibration Labs',
        capabilities:
          'Accredited metrology and instrument calibration, dimensional and torque calibration, and on-site measurement services with full uncertainty budgets.',
        region: 'US-Northeast',
        certifications: ['ISO/IEC 17025', 'A2LA Accredited']
      },
      {
        name: 'Guardian Safety Equipment',
        capabilities:
          'Distribution of personal protective equipment, fall-protection systems, portable gas detection, and competent-person safety training programs.',
        region: 'US-National',
        certifications: ['ANSI/ISEA', 'OSHA Authorized Trainer']
      }
    ]
  },
  {
    orgCode: ORG_B_CODE,
    orgName: 'Cascade Industrial Group',
    suppliers: [
      {
        name: 'Titan Metalworks',
        capabilities:
          'Structural steel and plate fabrication, plate rolling and forming, heavy weldments, and blast-and-paint finishing for mining and heavy-equipment frames.',
        region: 'US-West',
        certifications: ['AWS D1.1', 'ISO 9001:2015']
      },
      {
        name: 'Frostline Cold Chain',
        capabilities:
          'Temperature-controlled reefer transport, cold-storage cross-docking, validated cool-pack shipping, and continuous data-logged monitoring for chilled and frozen freight.',
        region: 'US-West',
        certifications: ['GDP', 'FSMA']
      },
      {
        name: 'Keystone Freight Group',
        capabilities:
          'Less-than-truckload and full-truckload trucking, regional cross-dock distribution, and expedited hotshot service with real-time load visibility.',
        region: 'US-Central',
        certifications: ['SmartWay', 'C-TPAT']
      },
      {
        name: 'Cobalt Industrial Chemicals',
        capabilities:
          'Specialty coatings, epoxy resins, and custom polymer formulation with pilot-scale reaction and quality-controlled batch production.',
        region: 'US-Gulf Coast',
        certifications: ['Responsible Care', 'ISO 14001']
      },
      {
        name: 'Nimbus Cloud & Hardware',
        capabilities:
          'Rack servers, hyperconverged storage arrays, virtualization licensing, and network switching with pre-configured staging and warranty logistics.',
        region: 'US-West',
        certifications: ['ISO 27001']
      },
      {
        name: 'Everest Facility Services',
        capabilities:
          'Building maintenance and custodial services, commercial HVAC/R service contracts, and energy-efficiency retrofits for warehouse and office portfolios.',
        region: 'US-Mountain',
        certifications: ['ISO 41001']
      },
      {
        name: 'Lighthouse Advisory Partners',
        capabilities:
          'Management consulting, strategic sourcing and procurement advisory, and interim operations and finance staffing for industrial firms.',
        region: 'US-Northeast',
        certifications: ['ISO 9001:2015']
      },
      {
        name: 'Precision Aero Components',
        capabilities:
          'Five-axis machining of complex aerospace parts, hard-metal turning, tight-tolerance grinding, and CMM inspection with source-inspection support.',
        region: 'US-Southwest',
        certifications: ['AS9100D', 'NADCAP']
      },
      {
        name: 'ClearFlow Water Systems',
        capabilities:
          'Reverse-osmosis and ultrafiltration packages, wastewater reclamation skids, and automated dosing systems with remote telemetry.',
        region: 'US-Southeast',
        certifications: ['NSF/ANSI 61']
      },
      {
        name: 'Volt Power Contractors',
        capabilities:
          'Medium-voltage electrical construction, substation build and commissioning, and controls integration for process and utility clients.',
        region: 'US-Central',
        certifications: ['UL 508A', 'NECA Member']
      },
      {
        name: 'Origami Packaging Co.',
        capabilities:
          'Protective packaging engineering, molded-pulp and foam inserts, and contract packing with automated case erecting and labeling.',
        region: 'US-West',
        certifications: ['FSC Chain of Custody', 'SQF']
      },
      {
        name: 'Zenith Metrology Services',
        capabilities:
          'Calibration and dimensional inspection, coordinate-measuring-machine programming, and gauge R&R studies with accredited certificates.',
        region: 'US-Northeast',
        certifications: ['ISO/IEC 17025']
      },
      {
        name: 'Sentinel Safety Supply',
        capabilities:
          'Industrial personal protective equipment, respiratory-protection fit testing, arc-flash clothing, and site safety consulting.',
        region: 'US-National',
        certifications: ['ANSI/ISEA']
      }
    ]
  }
];
