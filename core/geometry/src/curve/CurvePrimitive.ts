/*---------------------------------------------------------------------------------------------
* Copyright (c) 2018 Bentley Systems, Incorporated. All rights reserved.
* Licensed under the MIT License. See LICENSE.md in the project root for license terms.
*--------------------------------------------------------------------------------------------*/
/** @module Curve */
import { AxisOrder, Geometry, PlaneAltitudeEvaluator } from "../Geometry";
import { StrokeOptions } from "./StrokeOptions";
import { Order2Bezier } from "../numerics/BezierPolynomials";
import { Point3d, Vector3d } from "../geometry3d/Point3dVector3d";
import { Transform } from "../geometry3d/Transform";
import { Matrix3d } from "../geometry3d/Matrix3d";
import { Plane3dByOriginAndUnitNormal } from "../geometry3d/Plane3dByOriginAndUnitNormal";
import { Ray3d } from "../geometry3d/Ray3d";
import { Plane3dByOriginAndVectors } from "../geometry3d/Plane3dByOriginAndVectors";
import { NewtonEvaluatorRtoR, Newton1dUnboundedApproximateDerivative } from "../numerics/Newton";
import { Quadrature } from "../numerics/Quadrature";
import { IStrokeHandler } from "../geometry3d/GeometryHandler";
import { LineString3d } from "./LineString3d";
import { Clipper } from "../clipping/ClipUtils";
import { CurveLocationDetail, CurveSearchStatus } from "./CurveLocationDetail";
import { GeometryQuery } from "./GeometryQuery";
/** Type for callback function which announces a pair of numbers, such as a fractional interval, along with a containing CurvePrimitive. */
export type AnnounceNumberNumberCurvePrimitive = (a0: number, a1: number, cp: CurvePrimitive) => void;
export type AnnounceNumberNumber = (a0: number, a1: number) => void;
export type AnnounceCurvePrimitive = (cp: CurvePrimitive) => void;

/**
 * A curve primitive is bounded
 * A curve primitive maps fractions in 0..1 to points in space.
 * As the fraction proceeds from 0 towards 1, the point moves "forward" along the curve.
 * True distance along the curve is not always strictly proportional to fraction.
 * * LineSegment3d always has proportional fraction and distance
 * * an Arc3d which is true circular has proportional fraction and distance
 * *  A LineString3d is not proportional (except for special case of all segments of equal length)
 * * A Spiral3d is proportional
 * * A BsplineCurve3d is only proportional for special cases.
 *
 * For fractions outside 0..1, the curve primitive class may either (a) return the near endpoint or (b) evaluate an extended curve.
 */
export abstract class CurvePrimitive extends GeometryQuery {
  protected constructor() { super(); }
  /** Return the point (x,y,z) on the curve at fractional position.
   * @param fraction fractional position along the geometry.
   * @returns Returns a point on the curve.
   */
  public abstract fractionToPoint(fraction: number, result?: Point3d): Point3d;
  /** Return the point (x,y,z) and derivative on the curve at fractional position.
   *
   * * Note that this derivative is "derivative of xyz with respect to fraction."
   * * this derivative shows the speed of the "fractional point" moving along the curve.
   * * this is not generally a unit vector.  use fractionToPointAndUnitTangent for a unit vector.
   * @param fraction fractional position along the geometry.
   * @returns Returns a ray whose origin is the curve point and direction is the derivative with respect to the fraction.
   */
  public abstract fractionToPointAndDerivative(fraction: number, result?: Ray3d): Ray3d;
  /**
   *
   * @param fraction fractional position on the curve
   * @param result optional receiver for the result.
   * @returns Returns a ray whose origin is the curve point and direction is the unit tangent.
   */
  public fractionToPointAndUnitTangent(fraction: number, result?: Ray3d): Ray3d {
    const ray = this.fractionToPointAndDerivative(fraction, result);
    ray.trySetDirectionMagnitudeInPlace(1.0);
    return ray;
  }
  /** Return a plane with
   *
   * * origin at fractional position along the curve
   * * vectorU is the first derivative, i.e. tangent vector with length equal to the rate of change with respect to the fraction.
   * * vectorV is the second derivative, i.e.derivative of vectorU.
   */
  public abstract fractionToPointAnd2Derivatives(fraction: number, result?: Plane3dByOriginAndVectors): Plane3dByOriginAndVectors | undefined;

  /** Construct a frenet frame:
   * * origin at the point on the curve
   * * x axis is unit vector along the curve (tangent)
   * * y axis is perpendicular and in the plane of the osculating circle.
   * * z axis perpendicular to those.
   */
  public fractionToFrenetFrame(fraction: number, result?: Transform): Transform | undefined {
    const plane = this.fractionToPointAnd2Derivatives(fraction);
    if (!plane) return undefined;
    let axes = Matrix3d.createRigidFromColumns(plane.vectorU, plane.vectorV, AxisOrder.XYZ);
    if (axes)
      return Transform.createRefs(plane.origin, axes, result);
    // 2nd derivative not distinct -- do arbitrary headsup ...
    const perpVector = Matrix3d.createPerpendicularVectorFavorXYPlane(plane.vectorU, plane.vectorV);
    axes = Matrix3d.createRigidFromColumns(plane.vectorU, perpVector, AxisOrder.XYZ);
    if (axes)
      return Transform.createRefs(plane.origin, axes, result);
    return undefined;
  }
  /**
   *
   * * Curve length is always positive.
   * @returns Returns a (high accuracy) length of the curve.
   * @returns Returns the length of the curve.
   */
  public curveLength(): number {
    const context = new CurveLengthContext();
    this.emitStrokableParts(context);
    return context.getSum();
  }
  /**
   *
   * * Curve length is always positive.
   * @returns Returns a (high accuracy) length of the curve between fractional positions
   */
  public curveLengthBetweenFractions(fraction0: number, fraction1: number): number {
    if (fraction0 === fraction1)
      return 0.0;
    const scale = this.getFractionToDistanceScale();
    if (scale !== undefined) {
      // We are in luck! simple proportions determine it all  !!!
      // (for example, a LineSegment3d or a circular arc)
      const totalLength = this.curveLength();
      return Math.abs((fraction1 - fraction0) * totalLength);
    }
    const context = new CurveLengthContext(fraction0, fraction1);
    this.emitStrokableParts(context);
    return Math.abs(context.getSum());
  }

  /**
   *
   * * Run an integration (with a default gaussian quadrature) with a fixed fractional step
   * * This is typically called by specific curve type implementations of curveLengthBetweenFrations.
   *   * For example, in Arc3d implementation of curveLengthBetweenFrations:
   *     * If the Arc3d is true circular, it the arc is true circular, use the direct `arcLength = radius * sweepRadians`
   *     * If the Arc3d is not true circular, call this method with an interval count appropriate to eccentricity and sweepRadians.
   * @returns Returns an integral estimated by numerical quadrature between the fractional positions.
   * @param fraction0 start fraction for integration
   * @param fraction1 end fraction for integration
   * @param numInterval number of quadrature intervals
   */
  public curveLengthWithFixedIntervalCountQuadrature(fraction0: number, fraction1: number, numInterval: number, numGauss: number = 5): number {
    if (fraction0 > fraction1) {
      const fSave = fraction0;
      fraction0 = fraction1;
      fraction1 = fSave;
    }
    const context = new CurveLengthContext(fraction0, fraction1, numGauss);
    context.announceIntervalForUniformStepStrokes(this, numInterval, fraction0, fraction1);
    return Math.abs(context.getSum());
  }

  /**
   *
   * * (Attempt to) find a position on the curve at a signed distance from start fraction.
   * * Return the postion as a CurveLocationDetail.
   * * In the `CurveLocationDetail`, record:
   *   * `fractional` position
   *   * `fraction` = coordinates of the point
   *   * `search
   *   * `a` = (signed!) distance moved.   If `allowExtension` is false and the move reached the start or end of the curve, this distance is smaller than the requested signedDistance.
   *   * `curveSearchStatus` indicates one of:
   *     * `error` (unusual) computation failed not supported for this curve.
   *     * `success` full movement completed
   *     * `stoppedAtBoundary` partial movement completed. This can be due to either
   *        * `allowExtendsion` parameter sent as `false`
   *        * the curve type (e.g. bspline) does not support extended range.
   * * if `allowExtension` is true, movement may still end at the startpoint or endpoint for curves that do not support extended geometry (specifically bsplines)
   * * if the curve returns a value (i.e. not `undefined`) for `curve.getFractionToDistanceScale()`, the base class carries out the computation
   *    and returns a final location.
   *   * LineSegment3d relies on this.
   * * If the curve does not implement the computation or the curve has zero length, the returned `CurveLocationDetail` has
   *    * `fraction` = the value of `startFraction`
   *    * `point` = result of `curve.fractionToPoint(startFraction)`
   *    * `a` = 0
   *    * `curveStartState` = `CurveSearchStatus.error`
   * @param startFraction fractional position where the move starts
   * @param signedDistance distance to move.   Negative distance is backwards in the fraction space
   * @param allowExtension if true, all the move to go beyond the startpoint or endpoint of the curve.  If false, do not allow movement beyond the startpoint or endpoint
   * @param result optional result.
   * @returns A CurveLocationDetail annotated as above.  Note that if the curve does not support the calculation, there is still a result which contains the point at the input startFraction, with failure indicated in the `curveStartState` member
   */
  public moveSignedDistanceFromFraction(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail {
    const scale = this.getFractionToDistanceScale();
    if (scale !== undefined) {
      // We are in luck! simple proportions determine it all  !!!
      // (for example, a LineSegment3d or a circular arc)
      const totalLength = this.curveLength();
      const signedFractionMove = Geometry.conditionalDivideFraction(signedDistance, totalLength);
      if (signedFractionMove === undefined) {
        return CurveLocationDetail.createCurveFractionPointDistanceCurveSearchStatus(
          this, startFraction, this.fractionToPoint(startFraction), 0.0, CurveSearchStatus.error);
      }
      return CurveLocationDetail.createConditionalMoveSignedDistance(
        allowExtension,
        this,
        startFraction,
        startFraction + signedFractionMove,
        signedDistance,
        result);
    }
    return this.moveSignedDistanceFromFractionGeneric(startFraction, signedDistance, allowExtension, result);
  }
  /**
   * Generic algorithm to search for point at signed distance from a fractional start point.
   * * This will work for well for smooth curves.
   * * Curves with tangent or other low-order-derivative discontinuities may need to implement specialized algorithms.
   * * We need to find an endFraction which is the end-of-interval (usually upper) limit of integration of the tangent magnitude from startFraction to endFraction
   * * That integral is a function of endFraction.
   * * The derivative of that integral with respect to end fraction is the tangent magnitude at end fraction.
   * * Use that function and (easily evaluated!) derivative for a Newton iteration
   * * TO ALL WHO HAVE FUZZY MEMORIES OF CALCULUS CLASS: "The derivative of the integral wrt upper limit is the value of the integrand there" is the
   *       fundamental theorem of integral calculus !!! The fundeamental theorem is not just an abstraction !!! It is being used
   *       here in its barest possible form !!!
   * * See https://en.wikipedia.org/wiki/Fundamental_theorem_of_calculus
   * @param startFraction
   * @param signedDistance
   * @param _allowExtension
   * @param result
   */
  protected moveSignedDistanceFromFractionGeneric(startFraction: number, signedDistance: number, allowExtension: boolean, result?: CurveLocationDetail): CurveLocationDetail {
    const limitFraction = signedDistance > 0.0 ? 1.0 : 0.0;
    const absDistance = Math.abs(signedDistance);
    const directionFactor = signedDistance < 0.0 ? -1.0 : 1.0;
    const availableLength = this.curveLengthBetweenFractions(startFraction, limitFraction);    // that is always positive
    if (availableLength < absDistance && !allowExtension)
      return CurveLocationDetail.createConditionalMoveSignedDistance(allowExtension, this, startFraction, limitFraction, signedDistance, result);
    const fractionStep = absDistance / availableLength;
    let fractionB = Geometry.interpolate(startFraction, fractionStep, limitFraction);
    let fractionA = startFraction;
    let distanceA = 0.0;
    const tol = 1.0e-12 * availableLength;
    let numConverged = 0;
    const tangent = Ray3d.createXAxis();
    // on each loop entry:
    // fractionA is the most recent endOfInterval.  (It may have been reached by a mixtrueo forward and backward step.)
    // distanceA is the distance to (the point at) fractionA
    // fractionB is the next end fraction
    for (let iterations = 0; iterations < 10; iterations++) {
      const distanceAB = this.curveLengthBetweenFractions(fractionA, fractionB);
      const directionAB = fractionB > fractionA ? directionFactor : -directionFactor;
      const distance0B = distanceA + directionAB * distanceAB;
      const distanceError = absDistance - distance0B;
      if (Math.abs(distanceError) < tol) {
        numConverged++;
        if (numConverged > 1)
          break;
      } else {
        numConverged = 0;
      }
      this.fractionToPointAndDerivative(fractionB, tangent);
      const tangentMagnitude = tangent.direction.magnitude();
      fractionA = fractionB;
      fractionB = fractionA + directionFactor * distanceError / tangentMagnitude;
      if (fractionA === fractionB) { // YES -- that is an exact equality test.   When it happens, there's no need for confirming with another iteration.
        numConverged = 100;
        break;
      }
      distanceA = distance0B;
    }
    if (numConverged > 1)
      return CurveLocationDetail.createConditionalMoveSignedDistance(false, this, startFraction, fractionB, signedDistance, result);

    result = CurveLocationDetail.createCurveEvaluatedFraction(this, startFraction, result);
    result.a = 0.0;
    result.curveSearchStatus = CurveSearchStatus.error;
    return result;
  }

  /**
   * * Returns true if the curve's fraction queries extend beyond 0..1.
   * * Base class default implementation returns false.
   * * These class (and perhaps others in the future) will return true:
   *   * LineSegment3d
   *   * LineString3d
   *   * Arc3d
   */
  public get isExtensibleFractionSpace(): boolean { return false; }
  /**
   * Compute a length which may be an fast approximation to the true length.
   * This is expected to be either (a) exact or (b) larger than the actual length, but by no more than
   * a small multiple, perhaps up to PI/2, but commonly much closer to 1.
   *
   * * An example use of this is for setting a tolerance which is a small multiple of the curve length.
   * * Simple line, circular arc, and transition spiral may return exact length
   * * Ellipse may return circumference of some circle or polygon that encloses the ellipse.
   * * bspline curve may return control polygon length
   * *
   */
  public abstract quickLength(): number;
  /** Search for the curve point that is closest to the spacePoint.
   *
   * * If the space point is exactly on the curve, this is the reverse of fractionToPoint.
   * * Since CurvePrimitive should always have start and end available as candidate points, this method should always succeed
   * @param spacePoint point in space
   * @param extend true to extend the curve (if possible)
   * @returns Returns a CurveLocationDetail structure that holds the details of the close point.
   */
  public closestPoint(spacePoint: Point3d, extend: boolean): CurveLocationDetail | undefined {
    const strokeHandler = new ClosestPointStrokeHandler(spacePoint, extend);
    this.emitStrokableParts(strokeHandler);
    return strokeHandler.claimResult();
  }
  /**
   * Find intervals of this curvePrimitive that are interior to a clipper
   * @param clipper clip structure (e.g. clip planes)
   * @param announce (optional) function to be called announcing fractional intervals"  ` announce(fraction0, fraction1, curvePrimitive)`
   * @returns true if any "in" segments are announced.
   */
  public announceClipIntervals(_clipper: Clipper, _announce?: AnnounceNumberNumberCurvePrimitive): boolean {
    // DEFAULT IMPLEMENTATION -- no interior parts
    return false;
  }

  /** Return (if possible) a curve primitive which is a portion of this curve.
   * @param _fractionA [in] start fraction
   * @param _fractionB [in] end fraction
   */
  public clonePartialCurve(_fractionA: number, _fractionB: number): CurvePrimitive | undefined {
    return undefined;
  }
  /**
   * * If the curve primitive has distance-along-curve strictly proportional to curve fraction, return true
   * * If distance-along-the-curve is not proportional, return undefined.
   * * When defined, the scale factor is alwyas the length of the curve.
   * * This scale factor is typically available for these curve types:
   * * * All `LineSegment3d`
   * * * Arc3d which is a true circular arc (axes perpendicular and of equal length).
   * * * CurveChainWithDistanceIndex
   * * This scale factor is undefined for these curve types:
   * * * Arc3d which is a true ellipse, i.e. unequal lengths of defining vectors or non-perpendicular defining vectors.
   * * * bspline and bezier curves
   * @returns scale factor or undefined
   */
  public getFractionToDistanceScale(): number | undefined { return undefined; }

  /** Reverse the curve's data so that its fractional stroking moves in the opposite direction. */
  public abstract reverseInPlace(): void;
  /**
   * Compute intersections with a plane.
   * The intersections are appended to the result array.
   * The base class implementation emits strokes to an AppendPlaneIntersectionStrokeHandler object, which uses a Newton iteration to get
   * high-accuracy intersection points within strokes.
   * Derived classes should override this default implementation if there are easy analytic solutions.
   * @param plane The plane to be intersected.
   * @param result Array to receive intersections
   * @returns Return the number of CurveLocationDetail's added to the result array.
   */
  public appendPlaneIntersectionPoints(plane: PlaneAltitudeEvaluator, result: CurveLocationDetail[]): number {
    const strokeHandler = new AppendPlaneIntersectionStrokeHandler(plane, result);
    const n0 = result.length;
    this.emitStrokableParts(strokeHandler);
    return result.length - n0;
  }
  /** Ask if the curve is within tolerance of a plane.
   * @returns Returns true if the curve is completely within tolerance of the plane.
   */
  public abstract isInPlane(plane: Plane3dByOriginAndUnitNormal): boolean;
  /** return the start point of the primitive.  The default implementation returns fractionToPoint (0.0) */
  public startPoint(result?: Point3d): Point3d { return this.fractionToPoint(0.0, result); }
  /** @returns return the end point of the primitive. The default implementation returns fractionToPoint(1.0) */
  public endPoint(result?: Point3d): Point3d { return this.fractionToPoint(1.0, result); }
  /** Add strokes to caller-supplied linestring */
  public abstract emitStrokes(dest: LineString3d, options?: StrokeOptions): void;
  /** Ask the curve to announce points and simple subcurve fragments for stroking.
   * See IStrokeHandler for description of the sequence of the method calls.
   */
  public abstract emitStrokableParts(dest: IStrokeHandler, options?: StrokeOptions): void;
}

/** Intermediate class for managing the parentCurve announcements from an IStrokeHandler */
abstract class NewtonRotRStrokeHandler extends NewtonEvaluatorRtoR {
  protected _parentCurvePrimitive: CurvePrimitive | undefined;
  constructor() {
    super();
    this._parentCurvePrimitive = undefined;
  }
  /** retain the parentCurvePrimitive.
   * * Calling this method tells the handler that the parent curve is to be used for detail searches.
   * * Example: Transition spiral search is based on linestring first, then the exact spiral.
   * * Example: CurveChainWithDistanceIndex does NOT do this announcement -- the constituents act independently.
   */
  public startParentCurvePrimitive(curve: CurvePrimitive | undefined) { this._parentCurvePrimitive = curve; }
  /** Forget the parentCurvePrimitive */
  public endParentCurvePrimitive(_curve: CurvePrimitive | undefined) { this._parentCurvePrimitive = undefined; }
}

class AppendPlaneIntersectionStrokeHandler extends NewtonRotRStrokeHandler implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _plane: PlaneAltitudeEvaluator;
  private _intersections: CurveLocationDetail[];
  private _fractionA: number = 0;
  private _functionA: number = 0;
  // private derivativeA: number;   <---- Not currently used
  private _functionB: number = 0;
  private _fractionB: number = 0;
  private _derivativeB: number = 0;
  private _numThisCurve: number = 0;
  // scratch vars for use within methods.
  private _ray: Ray3d;
  private _newtonSolver: Newton1dUnboundedApproximateDerivative;

  // Return the first defined curve among: this.parentCurvePrimitive, this.curve;
  public effectiveCurve(): CurvePrimitive | undefined {
    if (this._parentCurvePrimitive)
      return this._parentCurvePrimitive;
    return this._curve;
  }
  public get getDerivativeB() { return this._derivativeB; }    // <--- DerivativeB is not currently used anywhere. Provided getter to suppress tslint error

  public constructor(plane: PlaneAltitudeEvaluator, intersections: CurveLocationDetail[]) {
    super();
    this._plane = plane;
    this._intersections = intersections;
    this.startCurvePrimitive(undefined);
    this._ray = Ray3d.createZero();
    this._newtonSolver = new Newton1dUnboundedApproximateDerivative(this);
  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
    this._fractionA = 0.0;
    this._numThisCurve = 0;
    this._functionA = 0.0;
    // this.derivativeA = 0.0;
  }
  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    this.startCurvePrimitive(cp);
    if (numStrokes < 1) numStrokes = 1;
    const df = 1.0 / numStrokes;
    for (let i = 0; i <= numStrokes; i++) {
      const fraction = Geometry.interpolate(fraction0, i * df, fraction1);
      cp.fractionToPointAndDerivative(fraction, this._ray);
      this.announcePointTangent(this._ray.origin, fraction, this._ray.direction);
    }
  }
  public announceSegmentInterval(
    _cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    const h0 = this._plane.altitude(point0);
    const h1 = this._plane.altitude(point1);
    if (h0 * h1 > 0.0)
      return;
    const fraction01 = Order2Bezier.solveCoffs(h0, h1);
    // let numIntersection = 0;
    if (fraction01 !== undefined) {
      // numIntersection++;
      const fraction = Geometry.interpolate(fraction0, fraction01, fraction1);
      this._newtonSolver.setX(fraction);
      if (this._newtonSolver.runIterations()) {
        this.announceSolutionFraction(this._newtonSolver.getX());
      }
      // this.intersections.push(CurveLocationDetail.createCurveFractionPoint(cp, fraction, cp.fractionToPoint(fraction)));
    }
  }
  private announceSolutionFraction(fraction: number) {
    const curve = this.effectiveCurve();
    if (curve) {
      this._ray = curve.fractionToPointAndDerivative(fraction, this._ray);
      this._intersections.push(CurveLocationDetail.createCurveFractionPoint(curve, fraction, this._ray.origin));
    }
  }
  public evaluate(fraction: number): boolean {
    const curve = this.effectiveCurve();
    if (!curve)
      return false;
    this.currentF = this._plane.altitude(curve.fractionToPoint(fraction));
    return true;
  }
  /**
   * * ASSUME both the "A" and "B"  evaluations (fraction, function, and derivative) are known.
   * * If function value changed sign between, interpolate an approximate root and improve it with
   *     the newton solver.
   */
  private searchInterval() {
    if (this._functionA * this._functionB > 0) return;
    if (this._functionA === 0) this.announceSolutionFraction(this._fractionA);
    if (this._functionB === 0) this.announceSolutionFraction(this._fractionB);
    if (this._functionA * this._functionB < 0) {
      const fraction = Geometry.inverseInterpolate(this._fractionA, this._functionA, this._fractionB, this._functionB);
      if (fraction) {
        this._newtonSolver.setX(fraction);
        if (this._newtonSolver.runIterations())
          this.announceSolutionFraction(this._newtonSolver.getX());
      }
    }
  }
  /** Evaluate and save _functionB, _derivativeB, and _fractionB. */
  private evaluateB(xyz: Point3d, fraction: number, tangent: Vector3d) {
    this._functionB = this._plane.altitude(xyz);
    this._derivativeB = this._plane.velocity(tangent);
    this._fractionB = fraction;
  }
  /**
   * Announce point and tangent for evaluations.
   * * The function evaluation is saved as the "B" function point.
   * * The function point count is incremented
   * * If function point count is greater than 1, the current interval is searched.
   * * The just-evaluated point ("B") is saved as the "old" ("A") evaluation point.
   * @param xyz
   * @param fraction
   * @param tangent
   */
  public announcePointTangent(xyz: Point3d, fraction: number, tangent: Vector3d): void {
    this.evaluateB(xyz, fraction, tangent);
    if (this._numThisCurve++ > 0) this.searchInterval();
    this._functionA = this._functionB;
    this._fractionA = this._fractionB;
    this._fractionA = this._fractionB;
  }
}

class CurveLengthContext implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _summedLength: number;
  private _ray: Ray3d;
  private _fraction0: number;
  private _fraction1: number;
  private _gaussX: Float64Array;
  private _gaussW: Float64Array;
  private _gaussMapper: (xA: number, xB: number, xx: Float64Array, ww: Float64Array) => number;

  private tangentMagnitude(fraction: number): number {
    this._ray = (this._curve as CurvePrimitive).fractionToPointAndDerivative(fraction, this._ray);
    return this._ray.direction.magnitude();
  }
  public getSum() { return this._summedLength; }

  public constructor(fraction0: number = 0.0, fraction1: number = 1.0, numGaussPoints: number = 5) {
    this.startCurvePrimitive(undefined);
    this._summedLength = 0.0;
    this._ray = Ray3d.createZero();
    if (fraction0 < fraction1) {
      this._fraction0 = fraction0;
      this._fraction1 = fraction1;
    } else {
      this._fraction0 = fraction1;
      this._fraction1 = fraction0;
    }
    const maxGauss = 7;  // (As of Nov 2 2018, 7 is a fluffy overallocation-- the quadrature class only handles up to 5.)
    this._gaussX = new Float64Array(maxGauss);
    this._gaussW = new Float64Array(maxGauss);
    // This sets the number of gauss points.  This intgetes exactly for polynomials of (degree 2*numGauss - 1).
    if (numGaussPoints > 5 || numGaussPoints < 1)
      numGaussPoints = 5;
    switch (numGaussPoints) {
      case 1: this._gaussMapper = Quadrature.setupGauss1; break;
      case 2: this._gaussMapper = Quadrature.setupGauss2; break;
      case 3: this._gaussMapper = Quadrature.setupGauss3; break;
      case 4: this._gaussMapper = Quadrature.setupGauss4; break;
      default: this._gaussMapper = Quadrature.setupGauss5; break;
    }

  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
  }
  public startParentCurvePrimitive(_curve: CurvePrimitive) { }
  public endParentCurvePrimitive(_curve: CurvePrimitive) { }

  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    if (fraction0 < this._fraction0) fraction0 = this._fraction0;
    if (fraction1 > this._fraction1) fraction1 = this._fraction1;
    if (fraction1 > fraction0) {
      this.startCurvePrimitive(cp);
      if (numStrokes < 1) numStrokes = 1;
      const df = 1.0 / numStrokes;
      for (let i = 1; i <= numStrokes; i++) {
        const fractionA = Geometry.interpolate(fraction0, (i - 1) * df, fraction1);
        const fractionB = i === numStrokes ? fraction1 : Geometry.interpolate(fraction0, (i) * df, fraction1);
        const numGauss = this._gaussMapper(fractionA, fractionB, this._gaussX, this._gaussW);
        for (let k = 0; k < numGauss; k++) {
          this._summedLength += this._gaussW[k] * this.tangentMagnitude(this._gaussX[k]);
        }
      }
    }
  }
  public announceSegmentInterval(
    _cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    const segmentLength = point0.distance(point1);
    if (this._fraction0 <= fraction0 && fraction1 <= this._fraction1)
      this._summedLength += segmentLength;
    else {
      let g0 = fraction0;
      let g1 = fraction1;
      if (g0 < this._fraction0) g0 = this._fraction0;
      if (g1 > this._fraction1) g1 = this._fraction1;
      if (g1 > g0) {
        this._summedLength += segmentLength * (g1 - g0) / (fraction1 - fraction0);
      }
    }
  }
  public announcePointTangent(_xyz: Point3d, _fraction: number, _tangent: Vector3d): void {
    // uh oh -- need to retain point for next interval
  }
}
// context for searching for closest point .. .
class ClosestPointStrokeHandler extends NewtonRotRStrokeHandler implements IStrokeHandler {
  private _curve: CurvePrimitive | undefined;
  private _closestPoint: CurveLocationDetail | undefined;
  private _spacePoint: Point3d;
  private _extend: boolean;
  private _fractionA: number = 0;
  private _functionA: number = 0;
  private _functionB: number = 0;
  private _fractionB: number = 0;
  private _numThisCurve: number = 0;
  // scratch vars for use within methods.
  private _workPoint: Point3d;
  private _workRay: Ray3d;
  private _newtonSolver: Newton1dUnboundedApproximateDerivative;

  public constructor(spacePoint: Point3d, extend: boolean) {
    super();
    this._spacePoint = spacePoint;
    this._workPoint = Point3d.create();
    this._workRay = Ray3d.createZero();
    this._closestPoint = undefined;
    this._extend = extend;
    this.startCurvePrimitive(undefined);
    this._newtonSolver = new Newton1dUnboundedApproximateDerivative(this);
  }

  public claimResult(): CurveLocationDetail | undefined {
    if (this._closestPoint) {
      this._newtonSolver.setX(this._closestPoint.fraction);
      this._curve = this._closestPoint.curve;
      if (this._newtonSolver.runIterations())
        this.announceSolutionFraction(this._newtonSolver.getX());
    }
    return this._closestPoint;
  }
  public startCurvePrimitive(curve: CurvePrimitive | undefined) {
    this._curve = curve;
    this._fractionA = 0.0;
    this._numThisCurve = 0;
    this._functionA = 0.0;
  }
  public endCurvePrimitive() { }
  public announceIntervalForUniformStepStrokes(
    cp: CurvePrimitive,
    numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    this.startCurvePrimitive(cp);
    if (numStrokes < 1) numStrokes = 1;
    const df = 1.0 / numStrokes;
    for (let i = 0; i <= numStrokes; i++) {
      const fraction = Geometry.interpolate(fraction0, i * df, fraction1);
      cp.fractionToPointAndDerivative(fraction, this._workRay);
      this.announceRay(fraction, this._workRay);
    }
  }

  private announceCandidate(cp: CurvePrimitive, fraction: number, point: Point3d) {
    const distance = this._spacePoint.distance(point);
    if (this._closestPoint && distance > this._closestPoint.a)
      return;
    this._closestPoint = CurveLocationDetail.createCurveFractionPoint(cp, fraction, point, this._closestPoint);
    this._closestPoint.a = distance;
    if (this._parentCurvePrimitive !== undefined)
      this._closestPoint.curve = this._parentCurvePrimitive;
  }
  public announceSegmentInterval(
    cp: CurvePrimitive,
    point0: Point3d,
    point1: Point3d,
    _numStrokes: number,
    fraction0: number,
    fraction1: number): void {
    let localFraction = this._spacePoint.fractionOfProjectionToLine(point0, point1, 0.0);
    // only consider extending the segment if the immediate caller says we are at endpoints ...
    if (!this._extend)
      localFraction = Geometry.clampToStartEnd(localFraction, 0.0, 1.0);
    else {
      if (fraction0 !== 0.0)
        localFraction = Math.max(localFraction, 0.0);
      if (fraction1 !== 1.0)
        localFraction = Math.min(localFraction, 1.0);
    }
    this._workPoint = point0.interpolate(localFraction, point1);
    const globalFraction = Geometry.interpolate(fraction0, localFraction, fraction1);
    this.announceCandidate(cp, globalFraction, this._workPoint);
  }
  private searchInterval() {
    if (this._functionA * this._functionB > 0) return;
    if (this._functionA === 0) this.announceSolutionFraction(this._fractionA);
    if (this._functionB === 0) this.announceSolutionFraction(this._fractionB);
    if (this._functionA * this._functionB < 0) {
      const fraction = Geometry.inverseInterpolate(this._fractionA, this._functionA, this._fractionB, this._functionB);
      if (fraction) {
        this._newtonSolver.setX(fraction);
        if (this._newtonSolver.runIterations())
          this.announceSolutionFraction(this._newtonSolver.getX());
      }
    }
  }
  private evaluateB(fractionB: number, dataB: Ray3d) {
    this._functionB = dataB.dotProductToPoint(this._spacePoint);
    this._fractionB = fractionB;
  }
  private announceSolutionFraction(fraction: number) {
    if (this._curve)
      this.announceCandidate(this._curve, fraction, this._curve.fractionToPoint(fraction));
  }
  public evaluate(fraction: number): boolean {
    let curve = this._curve;
    if (this._parentCurvePrimitive)
      curve = this._parentCurvePrimitive;
    if (curve) {
      this._workRay = curve.fractionToPointAndDerivative(fraction, this._workRay);
      this.currentF = this._workRay.dotProductToPoint(this._spacePoint);
      return true;
    }
    return false;
  }
  public announceRay(fraction: number, data: Ray3d): void {
    this.evaluateB(fraction, data);
    if (this._numThisCurve++ > 0) this.searchInterval();
    this._functionA = this._functionB;
    this._fractionA = this._fractionB;
    this._fractionA = this._fractionB;
  }
  public announcePointTangent(point: Point3d, fraction: number, tangent: Vector3d) {
    this._workRay.set(point, tangent);
    this.announceRay(fraction, this._workRay);
  }
}
